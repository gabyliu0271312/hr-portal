/* 360°评估率 tooltip 提炼 - 02: 遍历列表接口全部页，找目标人员 + 有邀请数据的人
 * 用法：node capture-rate-tooltip-02-pages.js
 * 产出：out/rate-tooltip/02-pages.json
 */
process.env.NO_PROXY = '127.0.0.1,localhost';
process.env.no_proxy = '127.0.0.1,localhost';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SEMESTER = '7654423719619710195';
const ROLE = '7340285661313974274';
const HEADER = 'header_activity_manager_list_all';
const OUT = path.join(__dirname, 'out', 'rate-tooltip');
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('feishu.cn'));

  // 用页面内 fetch 走同鉴权翻页（只读接口）
  const all = [];
  let offset = 0, total = null;
  const INVDONE = 'semesterStageInviteReviewDonePercentageGroupKey:7654113886190436354:';
  while (offset < 1000) {
    const body = await page.evaluate(async ({ SEMESTER, ROLE, HEADER, offset }) => {
      const res = await fetch(`/perf/api/report/v3/semesters/${SEMESTER}/users/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offset, limit: 50, headerId: HEADER, orders: [{ key: 'directDepartment', order: 'ASC' }, { key: 'user', order: 'ASC' }], roleId: ROLE, filters: [{ key: 'range', values: ['2'] }] })
      });
      const j = await res.json();
      return { code: j.code, data: j.data };
    }, { SEMESTER, ROLE, HEADER, offset }).catch(e => ({ fetchErr: String(e) }));
    if (body.fetchErr || body.code !== 0) { log('FETCH_ERR', JSON.stringify(body).slice(0, 300)); break; }
    const users = body.data.users || [];
    for (const u of users) all.push(u);
    total = body.data.user_count;
    if (users.length < 50) break;
    offset += 50;
    await page.waitForTimeout(300);
  }
  log('TOTAL_FETCHED', all.length, 'user_count', total);
  fs.writeFileSync(path.join(OUT, '02-pages.json'), JSON.stringify(all, null, 1), 'utf8');

  // 目标人员
  const targets = ['aaron.zhu', '朱鹏旭', 'huixiang.chen', '陈慧祥', 'alice.xiao', '肖惠方'];
  for (const u of all) {
    const name = (u.user && u.user.name) || '';
    if (targets.some(t => name.includes(t))) {
      log('TARGET', JSON.stringify({
        name,
        id: u.user && u.user.id,
        rootReviewId: u.rootReviewId,
        invite: u[INVDONE],
        inviteStatus: u['semesterStageStatusGroup:invite_review:7654113886190436354'],
        dimission: u.realTimeDimissionStatus,
        dept: u.fullDepartmentPath && u.fullDepartmentPath.map(d => d.name).join('/'),
        directLeader: u.directLeader && u.directLeader.name,
        level: u.level && u.level.name,
      }, null, 1));
    }
  }

  // 有邀请数据的人（分母>0）
  log('---HAS_INVITE_DATA---');
  let n = 0;
  for (const u of all) {
    const k = u[INVDONE];
    if (k && k.denominator > 0) { log(' ', u.user && u.user.name, JSON.stringify(k), 'dimission', u.realTimeDimissionStatus); n++; }
  }
  log('has_invite_count', n);

  // 分布
  const dist = {};
  for (const u of all) {
    const k = u[INVDONE];
    const key = k ? `${k.numerator}/${k.denominator}` : 'missing';
    dist[key] = (dist[key] || 0) + 1;
  }
  log('DIST', JSON.stringify(dist));
  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
