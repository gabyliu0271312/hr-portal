export function shouldHideAppAside(meta) {
    return meta.hideAside === true || meta.menuCode === 'report.list';
}
