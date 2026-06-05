"""验证 /trees/cost-center 和 /trees/org API"""
import asyncio
import httpx


async def main() -> None:
    async with httpx.AsyncClient() as c:
        r = await c.post(
            "http://localhost:8000/api/v1/auth/login",
            json={"login_name": "admin", "password": "Admin@2026"},
        )
        print("login resp:", r.status_code, r.json())
        tok = r.json().get("access_token") or r.json().get("token")
        h = {"Authorization": f"Bearer {tok}"}
        cc_active = (await c.get("http://localhost:8000/api/v1/trees/cost-center", headers=h)).json()
        cc_all = (await c.get("http://localhost:8000/api/v1/trees/cost-center?include_inactive=true", headers=h)).json()
        org = (await c.get("http://localhost:8000/api/v1/trees/org", headers=h)).json()
        print(f"CC active-only roots={len(cc_active)} root.name={cc_active[0]['name']} children={len(cc_active[0]['children'])}")
        print(f"CC all      roots={len(cc_all)} root.name={cc_all[0]['name']} children={len(cc_all[0]['children'])}")
        print(f"ORG roots={len(org)} root.name={org[0]['name']} children={len(org[0]['children'])}")
        for ch in org[0]["children"]:
            print(f"  L2 {ch['name']} -> {len(ch['children'])} children")


if __name__ == "__main__":
    asyncio.run(main())
