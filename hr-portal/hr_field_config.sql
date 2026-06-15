--
-- PostgreSQL database dump
--

\restrict opBMV71Phd6OBdX9RYDeJ7uUVqJ0f5cvWmZ5xiur3nVJfPrWWHA82nhfCqVxFSX

-- Dumped from database version 15.17
-- Dumped by pg_dump version 15.17

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: datasets; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.datasets (id, name, description, is_active, created_by, created_at, updated_at) FROM stdin;
4	全量数据集	\N	t	1	2026-06-03 11:37:04.881689+00	2026-06-03 11:37:04.881689+00
5	单表字段库 · 员工实时花名册	系统自动创建，用于保存 员工实时花名册 的报表计算字段。	t	1	2026-06-08 07:48:04.904856+00	2026-06-08 07:48:04.904856+00
6	单表数据集 · 员工月度花名册	系统自动创建，用于 员工月度花名册 的报表、成本分摊与计算字段。	t	\N	2026-06-09 12:21:34.615672+00	2026-06-09 12:21:34.615672+00
7	单表数据集 · 员工月度工资表	系统自动创建，用于 员工月度工资表 的报表、成本分摊与计算字段。	t	\N	2026-06-09 12:21:34.615672+00	2026-06-09 12:21:34.615672+00
8	单表数据集 · 员工月度成本分摊表	系统自动创建，用于 员工月度成本分摊表 的报表、成本分摊与计算字段。	t	\N	2026-06-09 12:21:34.615672+00	2026-06-09 12:21:34.615672+00
9	单表数据集 · 成本中心月度维护表	系统自动创建，用于 成本中心月度维护表 的报表、成本分摊与计算字段。	t	\N	2026-06-09 12:21:34.615672+00	2026-06-09 12:21:34.615672+00
10	单表数据集 · 员工月度成本归集分类表	系统自动创建，用于 员工月度成本归集分类表 的报表、成本分摊与计算字段。	t	\N	2026-06-09 12:21:34.615672+00	2026-06-09 12:21:34.615672+00
11	单表数据集 · 员工月度成本分摊结果	系统自动创建，用于 员工月度成本分摊结果 的报表、成本分摊与计算字段。	t	\N	2026-06-09 12:21:34.615672+00	2026-06-09 12:21:34.615672+00
12	单表数据集 · 补偿金分期发放表	系统自动创建，用于 补偿金分期发放表 的报表、成本分摊与计算字段。	t	1	2026-06-10 07:15:23.653573+00	2026-06-10 07:15:23.653573+00
\.


--
-- Data for Name: dataset_calculated_fields; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.dataset_calculated_fields (id, dataset_id, code, label, description, formula, formula_display, data_type, agg_role, depends_on, used_functions, is_sensitive, is_active, created_by, created_at, updated_at) FROM stdin;
1	4	salary_bonus	应发工资（含补偿金及奖金）	\N	=IF(FIELD("emp_monthly_salary.employee_no") = 106676, FIELD("emp_monthly_salary.gross_salary_including_compensation") + FIELD("emp_year_end_bonus.bonus_amount"), FIELD("emp_monthly_salary.gross_salary_including_compensation"))	=IF(emp_monthly_salary.employee_no = 106676, emp_monthly_salary.gross_salary_including_compensation + emp_year_end_bonus.bonus_amount, emp_monthly_salary.gross_salary_including_compensation)	number	measure	["emp_monthly_salary.employee_no", "emp_monthly_salary.gross_salary_including_compensation", "emp_year_end_bonus.bonus_amount"]	["IF"]	f	t	1	2026-06-09 10:17:25.929075+00	2026-06-11 02:54:06.366188+00
2	4	field	本月实发	\N	=FIELD("emp_monthly_salary.net_salary") -FIELD("emp_severance_installment.installment_2") -FIELD("emp_severance_installment.installment_3") -FIELD("emp_severance_installment.installment_4") +IF(FIELD("emp_monthly_salary.employee_no") =106676,FIELD("emp_year_end_bonus.bonus_amount"),0)	=emp_monthly_salary.net_salary -emp_severance_installment.installment_2 -emp_severance_installment.installment_3 -emp_severance_installment.installment_4 +IF(emp_monthly_salary.employee_no =106676,emp_year_end_bonus.bonus_amount,0)	number	measure	["emp_monthly_salary.net_salary", "emp_severance_installment.installment_2", "emp_severance_installment.installment_3", "emp_severance_installment.installment_4", "emp_monthly_salary.employee_no", "emp_year_end_bonus.bonus_amount"]	["IF"]	f	t	1	2026-06-10 07:30:33.748192+00	2026-06-11 09:47:15.178822+00
\.


--
-- Data for Name: dataset_tables; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.dataset_tables (id, dataset_id, table_name, alias) FROM stdin;
73	5	emp_realtime_roster	current
78	6	emp_monthly_roster	current
79	7	emp_monthly_salary	current
80	8	emp_monthly_allocation	current
81	9	cost_center_monthly	current
82	10	emp_monthly_cost_class	current
83	11	emp_monthly_cost_result	current
84	12	field	current
92	4	emp_monthly_salary	emp_monthly_salary
90	4	emp_monthly_allocation	emp_monthly_allocation
91	4	cost_center_monthly	cost_center_monthly
93	4	emp_year_end_bonus	emp_year_end_bonus
94	4	emp_severance_installment	emp_severance_installment
\.


--
-- Data for Name: field_categories; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.field_categories (id, name, description, is_sensitive, created_at) FROM stdin;
3	基础	员工的基本信息	f	2026-06-09 10:58:08.493897+00
1	薪酬	工资奖金等	t	2026-05-22 15:25:22.400972+00
\.


--
-- Data for Name: registered_tables; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.registered_tables (id, table_name, table_label, description, is_period, period_col, is_builtin, is_result_table, icon, display_order, created_at, period_source, scope_exempt) FROM stdin;
6	emp_monthly_cost_class	员工月度成本归集分类表	\N	f	月份	t	f	Collection	60	2026-06-05 06:40:43.979311+00	field	f
1	emp_realtime_roster	员工实时花名册	\N	f	月份	t	f	List	10	2026-06-05 06:40:43.979311+00	field	f
5	cost_center_monthly	成本中心月度维护表	\N	t	month	t	f	OfficeBuilding	50	2026-06-05 06:40:43.979311+00	inject	f
7	emp_monthly_cost_result	员工月度成本分摊结果	\N	t	cost_period	t	t	TrendCharts	70	2026-06-05 06:40:43.979311+00	inject	f
3	emp_monthly_salary	员工月度工资表	\N	t	pay_month	t	f	Money	30	2026-06-05 06:40:43.979311+00	field	f
4	emp_monthly_allocation	员工月度成本分摊表	\N	t	cost_period	t	f	Histogram	40	2026-06-05 06:40:43.979311+00	field	f
2	emp_monthly_roster	员工月度花名册	\N	t	month	t	f	Calendar	20	2026-06-05 06:40:43.979311+00	field	f
9	emp_severance_installment	补偿金分期发放表	\N	f	月份	f	f	Grid	999	2026-06-10 07:15:23.653573+00	field	f
8	emp_year_end_bonus	年终奖金发放表	记录年终奖金发放记录	f	月份	f	f	DataLine	999	2026-06-09 09:54:39.321253+00	field	f
\.


--
-- Data for Name: table_columns; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.table_columns (id, table_name, column_code, column_label, data_type, is_pk_part, is_sensitive, is_visible, display_order, auto_discovered, description, created_at, updated_at, scope_role, copy_from_last_month, enum_options, agg_role, is_computed, formula_expr, global_field_id, source_field_id) FROM stdin;
178	emp_monthly_cost_class	cost_classification	费用类型	enum	f	f	t	30	f		2026-06-04 07:27:01.059583+00	2026-06-05 08:08:53.588608+00	\N	f	["\\u5de5\\u8d44", "\\u52b3\\u52a1", "\\u5916\\u5305", "\\u4ee3\\u53d1"]	dimension	f	\N	\N	\N
176	emp_monthly_cost_class	field_type	字段类型	enum	f	f	t	10	f		2026-06-04 07:24:25.326543+00	2026-06-04 07:24:25.326543+00	\N	f	["\\u5de5\\u53f7", "\\u7532\\u65b9"]	dimension	f	\N	\N	\N
525	emp_monthly_cost_result	field	本月实发	number	f	f	t	107	t	\N	2026-06-11 07:05:10.628437+00	2026-06-11 09:37:43.729283+00	\N	f	\N	measure	f	\N	\N	\N
499	emp_severance_installment	employee_no	工号	string	t	f	t	10	f		2026-06-10 07:15:56.074556+00	2026-06-10 07:15:56.074556+00	\N	f	null	dimension	f	\N	\N	\N
493	emp_year_end_bonus	employee_no	工号	string	t	f	t	10	f		2026-06-09 10:08:38.493233+00	2026-06-09 10:08:38.493233+00	\N	f	null	dimension	f	\N	\N	\N
494	emp_year_end_bonus	bonus_year	奖金归属年	string	t	f	t	20	f		2026-06-09 10:09:04.869045+00	2026-06-09 10:09:04.869045+00	\N	f	null	measure	f	\N	\N	\N
497	emp_year_end_bonus	currency	币种	string	t	f	t	50	f		2026-06-09 10:09:58.931989+00	2026-06-09 10:09:58.931989+00	\N	f	null	dimension	f	\N	\N	\N
71	emp_realtime_roster	employee_no	工号	number	t	f	t	10	t	\N	2026-05-24 03:07:51.181022+00	2026-05-24 03:07:51.181022+00	\N	f	\N	measure	f	\N	\N	44e5cebb-e2fa-4b69-b0cc-8f4d20167d9f
74	emp_realtime_roster	chinese_name	姓名（中文名）	string	f	f	t	40	t	\N	2026-05-24 03:07:51.181022+00	2026-05-24 03:07:51.181022+00	\N	f	\N	dimension	f	\N	\N	37ddc816-37e2-d132-062f-9a784c0084c4
75	emp_realtime_roster	english_name	英文名	string	f	f	t	50	t	\N	2026-05-24 03:07:51.181022+00	2026-05-24 03:07:51.181022+00	\N	f	\N	dimension	f	\N	\N	be73fb79-690c-4b06-8ad2-8b772be90cfa
177	emp_monthly_cost_class	value	值	string	f	f	t	20	f		2026-06-04 07:24:43.608079+00	2026-06-04 07:24:43.608079+00	\N	f	null	dimension	f	\N	\N	\N
76	emp_realtime_roster	hire_date	入职日期	date	f	f	t	60	t	\N	2026-05-24 03:07:51.181022+00	2026-05-24 03:07:51.181022+00	\N	f	\N	dimension	f	\N	\N	1b725de4-7e51-4888-ab05-dc435bb511f8
78	emp_realtime_roster	terminated_date	离职日期	date	f	f	t	80	t	\N	2026-05-24 03:07:51.181022+00	2026-05-24 03:07:51.181022+00	\N	f	\N	dimension	f	\N	\N	9e0a9a5d-f3d8-4262-84a4-9f1c7dc4c0ce
80	emp_realtime_roster	employee_status	人员状态	string	f	f	t	100	t	\N	2026-05-24 03:07:51.181022+00	2026-05-24 03:07:51.181022+00	\N	f	\N	dimension	f	\N	\N	1a92cb4f-a15d-4465-a228-5cfd46abbef9
83	emp_realtime_roster	bu	BU	string	f	f	t	130	t	\N	2026-05-24 03:07:51.181022+00	2026-05-24 03:07:51.181022+00	\N	f	\N	dimension	f	\N	\N	3e7fd239-431d-44f4-f676-df4d50cf38c1
84	emp_realtime_roster	company_name	公司名称	string	f	f	t	140	t	\N	2026-05-24 03:07:51.181022+00	2026-05-24 03:07:51.181022+00	employment_entity	f	\N	dimension	f	\N	\N	e0c74ad7-a8d6-4be9-8641-a86e055420e6
85	emp_realtime_roster	company_org	公司级组织	string	f	f	t	150	t	\N	2026-05-24 03:07:51.181022+00	2026-05-24 03:07:51.181022+00	\N	f	\N	dimension	f	\N	\N	a7bc1497-ba98-487c-85c0-7c732ce68489
86	emp_realtime_roster	department	一级部门	string	f	f	t	160	t	\N	2026-05-24 03:07:51.181022+00	2026-05-24 03:07:51.181022+00	\N	f	\N	dimension	f	\N	\N	da21ba4e-1bf4-4e59-9b2c-1e8fda7c86a7
87	emp_realtime_roster	department_2	二级部门	string	f	f	t	170	t	\N	2026-05-24 03:07:51.181022+00	2026-05-24 03:07:51.181022+00	\N	f	\N	dimension	f	\N	\N	a2c1bf8e-d15d-4f38-85d2-284fb8335c79
88	emp_realtime_roster	department_3	三级部门	string	f	f	t	180	t	\N	2026-05-24 03:07:51.181022+00	2026-05-24 03:07:51.181022+00	\N	f	\N	dimension	f	\N	\N	ac817865-29cc-4516-b1c1-2b6cb58364d6
89	emp_realtime_roster	department_4	四级部门	string	f	f	t	190	t	\N	2026-05-24 03:07:51.181022+00	2026-05-24 03:07:51.181022+00	\N	f	\N	dimension	f	\N	\N	9ca79caa-d90a-4e30-b441-6abea5e1af24
90	emp_realtime_roster	department_5	五级部门	string	f	f	t	200	t	\N	2026-05-24 03:07:51.181022+00	2026-05-24 03:07:51.181022+00	\N	f	\N	dimension	f	\N	\N	fa8df054-e00d-40d9-bb9a-68a33e217c02
91	emp_realtime_roster	employee_type	员工类型	string	f	f	t	210	t	\N	2026-05-24 03:07:51.181022+00	2026-05-24 03:07:51.181022+00	employment_type	f	\N	dimension	f	\N	\N	09423790-361a-4c1e-9e06-ad5185ec8273
223	emp_monthly_salary	employee_no	工号	number	t	f	t	70	t	\N	2026-06-04 08:20:35.649219+00	2026-06-09 09:30:42.871546+00	\N	f	\N	measure	f	\N	\N	b4317727-3d0a-4441-b0e1-2011e2d4ccf8
92	emp_realtime_roster	job_family	职位族	string	f	f	t	220	t	\N	2026-05-24 03:07:51.181022+00	2026-05-24 03:07:51.181022+00	\N	f	\N	dimension	f	\N	\N	e5998bee-239c-4159-a005-1cddc67473d6
93	emp_realtime_roster	job_category	职位类	string	f	f	t	230	t	\N	2026-05-24 03:07:51.181022+00	2026-05-24 03:07:51.181022+00	\N	f	\N	dimension	f	\N	\N	fd47c318-094c-4624-8941-cc213219bef9
94	emp_realtime_roster	standard_position	标准职位	string	f	f	t	240	t	\N	2026-05-24 03:07:51.181022+00	2026-05-24 03:07:51.181022+00	\N	f	\N	dimension	f	\N	\N	8f8fc55c-f698-400b-b5d6-60447b1d3af3
95	emp_realtime_roster	position	职位	string	f	f	t	250	t	\N	2026-05-24 03:07:51.181022+00	2026-05-24 03:07:51.181022+00	\N	f	\N	dimension	f	\N	\N	ca3f7f1f-8973-4b67-84bf-3ee91bb55d1d
96	emp_realtime_roster	direct_supervisor	直接上级	string	f	f	t	260	t	\N	2026-05-24 03:07:51.181022+00	2026-05-24 03:07:51.181022+00	\N	f	\N	dimension	f	\N	\N	a7d6b14d-c874-402d-be7d-ce829abca827
97	emp_realtime_roster	position_level	岗位层级	string	f	f	t	270	t	\N	2026-05-24 03:07:51.181022+00	2026-05-24 03:07:51.181022+00	\N	f	\N	dimension	f	\N	\N	74dfc56a-fd35-461f-8703-31c3a4a04763
100	emp_realtime_roster	management_level	管理职级	string	f	f	t	300	t	\N	2026-05-24 03:07:51.181022+00	2026-05-24 03:07:51.181022+00	\N	f	\N	dimension	f	\N	\N	2cc45a7a-43e6-2cee-d13c-5dfbac47706b
101	emp_realtime_roster	effective_date	生效日期	date	t	f	t	310	t	\N	2026-05-24 03:07:51.181022+00	2026-05-24 03:07:51.181022+00	\N	f	\N	dimension	f	\N	\N	f3106329-a6a3-42fd-90a5-876559b6fbe8
103	emp_realtime_roster	change_reason	变动原因	string	f	f	t	330	t	\N	2026-05-24 03:07:51.181022+00	2026-05-24 03:07:51.181022+00	\N	f	\N	dimension	f	\N	\N	822d3287-97f4-4b28-9c70-e7b551afb73f
104	emp_realtime_roster	base_salary	基本工资	string	f	f	t	340	t	\N	2026-05-24 03:07:51.181022+00	2026-05-24 03:07:51.181022+00	\N	f	\N	dimension	f	\N	\N	865535b8-f66a-4136-beb7-731fa8fe3bf7
105	emp_realtime_roster	position_salary	岗位工资	string	f	f	t	350	t	\N	2026-05-24 03:07:51.181022+00	2026-05-24 03:07:51.181022+00	\N	f	\N	dimension	f	\N	\N	e899b8a0-d419-4b09-a600-3dd01f676a67
106	emp_realtime_roster	target_year_end_bonus	目标年终奖	string	f	f	t	360	t	\N	2026-05-24 03:07:51.181022+00	2026-05-24 03:07:51.181022+00	\N	f	\N	dimension	f	\N	\N	e073b921-7af4-40f2-ba87-c33aaa37e47b
109	emp_realtime_roster	currency	币种	string	f	f	t	390	t	\N	2026-05-24 03:07:51.181022+00	2026-05-24 03:07:51.181022+00	\N	f	\N	dimension	f	\N	\N	a9d893b9-2cd1-0c32-a6ed-43384723d829
110	emp_realtime_roster	id_number	证件号码	number	f	f	t	400	t	\N	2026-05-24 03:07:51.181022+00	2026-05-24 03:07:51.181022+00	\N	f	\N	measure	f	\N	\N	3451508d-99b6-4e1c-9777-d8808d9e97dc
122	emp_realtime_roster	full_name	姓名	string	f	f	t	520	t	\N	2026-05-24 04:26:59.974116+00	2026-05-24 04:26:59.974116+00	person	f	\N	dimension	f	\N	\N	62018008-71bf-4084-88f6-28b0d6621e35
127	emp_realtime_roster	org_node_code	组织节点编码（权限用）	string	f	f	f	999	f	\N	2026-05-24 06:41:21.70394+00	2026-05-24 06:41:21.70394+00	org_node_code	f	\N	dimension	f	\N	\N	\N
131	emp_realtime_roster	work_location	工作地	string	f	f	t	1029	t	\N	2026-06-01 11:41:09.578841+00	2026-06-01 11:41:09.578841+00	\N	f	\N	dimension	f	\N	\N	f5734357-1bd9-4d48-8bec-faea6938458d
179	emp_monthly_salary	expense_type	费用类型	string	f	f	t	50	f	\N	2026-06-04 07:58:12.700639+00	2026-06-04 07:58:12.700639+00	\N	f	null	dimension	f	\N	\N	\N
224	emp_monthly_salary	full_name	姓名	string	f	f	t	80	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	dimension	f	\N	\N	a1fc8e94-616d-4bab-997c-01abbc58a060
225	emp_monthly_salary	english_name	英文名	string	f	f	t	90	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	dimension	f	\N	\N	c34a683e-0df9-45cd-b36f-a96062c5989c
226	emp_monthly_salary	client	甲方	string	f	f	t	100	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	dimension	f	\N	\N	6e8b7ecc-de04-4dd4-92ba-eab2d1712a0c
227	emp_monthly_salary	company_org	公司级组织	string	f	f	t	110	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	dimension	f	\N	\N	80148ae5-e5e2-49a1-8dc7-a9c0096f2a1a
228	emp_monthly_salary	department	一级部门	string	f	f	t	120	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	dimension	f	\N	\N	34b693e9-9214-46e0-bd23-80c16ed27ea1
229	emp_monthly_salary	department_2	二级部门	string	f	f	t	130	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	dimension	f	\N	\N	4b8b5f8c-4140-4419-8212-5ff1cb46c66f
230	emp_monthly_salary	department_3	三级部门	string	f	f	t	140	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	dimension	f	\N	\N	e7e88db0-c4e3-40da-b805-84a8d116fe8e
503	emp_severance_installment	installment_2	第二期发放	number	f	f	t	50	f		2026-06-10 07:16:42.434302+00	2026-06-10 07:32:34.991008+00	\N	f	null	measure	f	\N	\N	\N
505	emp_severance_installment	installment_4	第四期发放	number	f	f	t	70	f		2026-06-10 07:17:00.059785+00	2026-06-10 07:32:34.991008+00	\N	f	null	measure	f	\N	\N	\N
495	emp_year_end_bonus	bonus_month	奖金发放月份	number	t	f	t	30	f		2026-06-09 10:09:16.894189+00	2026-06-09 12:51:06.132157+00	\N	f	null	dimension	f	\N	\N	\N
496	emp_year_end_bonus	bonus_amount	奖金发放金额	number	t	f	t	40	f		2026-06-09 10:09:28.687976+00	2026-06-09 10:16:30.190517+00	\N	f	null	dimension	f	\N	\N	\N
222	emp_monthly_salary	pay_month	发薪月份	string	t	f	t	60	t	\N	2026-06-04 08:20:35.649219+00	2026-06-11 13:56:34.515116+00	\N	f	\N	dimension	f	\N	\N	e554e1d4-7b24-41f3-ae0e-6b677c98489b
500	emp_severance_installment	terminated_month	离职月份	string	f	f	t	20	f		2026-06-10 07:16:15.645456+00	2026-06-10 07:16:15.645456+00	\N	f	null	dimension	f	\N	\N	\N
501	emp_severance_installment	amount	补偿金额	string	f	f	t	30	f		2026-06-10 07:16:27.522888+00	2026-06-10 07:32:34.991008+00	\N	f	null	measure	f	\N	\N	\N
504	emp_severance_installment	installment_3	第三期发放	number	f	f	t	60	f		2026-06-10 07:16:49.403648+00	2026-06-10 07:32:34.991008+00	\N	f	null	measure	f	\N	\N	\N
231	emp_monthly_salary	department_4	四级部门	string	f	f	t	150	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	dimension	f	\N	\N	b876e09b-04e3-4b74-9ebb-d8282276c34d
232	emp_monthly_salary	department_5	五级部门	string	f	f	t	160	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	dimension	f	\N	\N	4ca8b77a-9889-4b25-b0a6-21fc7243b8cf
233	emp_monthly_salary	position	职位	string	f	f	t	170	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	dimension	f	\N	\N	dd673e0a-e21c-4e9f-8f7d-e44b84bfa91d
234	emp_monthly_salary	employee_nature	员工性质	string	f	f	t	180	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	dimension	f	\N	\N	db54f62e-1076-4808-ab14-2fa8822f259f
235	emp_monthly_salary	hire_date	入职日期	date	f	f	t	190	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	dimension	f	\N	\N	df5398f8-17fa-4ddd-a3fd-ff4abaf4662d
236	emp_monthly_salary	terminated_date	离职日期	string	f	f	t	200	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	dimension	f	\N	\N	c9ab38d3-63d4-4e1b-bd00-648b227b0379
237	emp_monthly_salary	base_salary	基本工资	number	f	f	t	210	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	measure	f	\N	\N	201039dd-6184-4f2d-a657-9755289d7747
238	emp_monthly_salary	position_salary	岗位工资	number	f	f	t	220	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:26:38.66839+00	\N	f	\N	measure	f	\N	\N	0ec57503-de2c-4350-9ab9-d2f5ffc5409e
239	emp_monthly_salary	currency	币种(自定义)	string	f	f	t	230	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	dimension	f	\N	\N	cf20a17c-34fb-4027-b4cb-b4b0deb225f7
240	emp_monthly_salary	custom_exchange_rate	汇率(自定义)	number	f	f	t	240	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	measure	f	\N	\N	f5d80d18-5eb2-44d0-9958-96d413d7ed08
241	emp_monthly_salary	tax_salary_cost	税前工资成本	number	f	f	t	250	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	measure	f	\N	\N	8b39e293-8535-4e73-9fde-d2ac5ee5f5b7
242	emp_monthly_salary	referral_bonus	推荐奖	number	f	f	t	260	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	measure	f	\N	\N	18ced135-9531-4989-a81d-6303060c2024
243	emp_monthly_salary	salary	应发工资	number	f	f	t	270	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	measure	f	\N	\N	3bb24ce6-21f2-445c-a3ae-3791fa7caf3b
244	emp_monthly_salary	economic_compensation	经济补偿金	number	f	f	t	280	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	measure	f	\N	\N	a8045bde-203a-4c92-b019-b43259f05700
245	emp_monthly_salary	social_security_employee_part	社保个人部分（工资条）	number	f	f	t	290	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	measure	f	\N	\N	6e7a19b4-d210-43e8-87b2-d747cdfc6a95
247	emp_monthly_salary	individual_income_tax_total	个税总额	number	f	f	t	310	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	measure	f	\N	\N	a843ff00-ae09-4811-ba2e-cbe37aa43cf0
248	emp_monthly_salary	post_tax_deductions_total	税后扣除项总额	number	f	f	t	320	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	measure	f	\N	\N	230b08ae-60b8-4157-bf94-1c5279c9e99d
249	emp_monthly_salary	net_salary	实发工资	number	f	f	t	330	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	measure	f	\N	\N	ea91bc64-07a8-4c32-9fa6-23e6a0849641
250	emp_monthly_salary	employer_social_security_cost	单位社保费用	number	f	f	t	340	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:26:38.66839+00	\N	f	\N	measure	f	\N	\N	6a3ebefb-80d5-4104-ac92-0af851cfe5f3
251	emp_monthly_salary	employer_housing_fund	单位住房公积金	number	f	f	t	350	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	measure	f	\N	\N	c059d13c-c97c-4cdc-bd7f-10f6a5b95af2
252	emp_monthly_salary	disability_security_contribution	残保金	number	f	f	t	360	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	measure	f	\N	\N	31e027b0-f3ba-4acd-b605-e35bccf77973
253	emp_monthly_salary	service_fee	服务费	number	f	f	t	370	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	measure	f	\N	\N	4a0138eb-8667-4c30-b1ed-168c0f2bb9d0
254	emp_monthly_salary	interest_free_loan_interest	无息借款利息	number	f	f	t	380	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	measure	f	\N	\N	12122dae-08c0-48c0-9c7e-7f32745aee88
256	emp_monthly_salary	housing_allowance_post_tax	住房补贴（税后）	number	f	f	t	400	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	measure	f	\N	\N	7b3e1899-8722-4cfd-8373-1480c6f837e8
257	emp_monthly_salary	interest_free_loan_repayment	无息借款还款	number	f	f	t	410	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	measure	f	\N	\N	15603653-eee6-4855-a773-cfc05766a1ec
258	emp_monthly_salary	rent	房租	number	f	f	t	420	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	measure	f	\N	\N	7f337804-a41a-40cf-9731-f3b10b1b8815
259	emp_monthly_salary	property_management_fee	物业费	number	f	f	t	430	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	measure	f	\N	\N	72f5ca3f-a662-4715-b674-e564bf12f525
260	emp_monthly_salary	electricity_fee	电费	number	f	f	t	440	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	measure	f	\N	\N	7520f373-47f0-4bdc-bf2a-696069c9e7f1
261	emp_monthly_salary	gas_fee	燃气费	number	f	f	t	450	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	measure	f	\N	\N	853608df-2a59-42c0-a07a-2f597e7af67b
262	emp_monthly_salary	employee_card_reissue_deduction	工卡补办扣款	number	f	f	t	460	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	measure	f	\N	\N	0671533e-9f34-4b4a-9e6a-7e3185e1d229
263	emp_monthly_salary	exit_employee_card_loss_deduction	离职工卡丢失扣款	number	f	f	t	470	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	measure	f	\N	\N	62de1a95-a715-469a-8f82-54fd6925b3b6
264	emp_monthly_salary	didi_deduction	滴滴扣款	number	f	f	t	480	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	measure	f	\N	\N	972a527e-8a1d-4d3f-b503-1c2a09c96a8f
265	emp_monthly_salary	travel_excess_deduction	差旅超标扣款	number	f	f	t	490	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	measure	f	\N	\N	6d773645-2448-4144-8b3a-aa60adcac6c9
266	emp_monthly_salary	fixed_asset_deduction	固定资产扣款	number	f	f	t	500	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	measure	f	\N	\N	4b295022-973e-4862-8078-15cc7e455190
267	emp_monthly_salary	parking_fee	停车费	number	f	f	t	510	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	measure	f	\N	\N	5f547165-8dbf-4829-8c86-b485893ef6bf
268	emp_monthly_salary	training_deduction	培训扣款	number	f	f	t	520	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	measure	f	\N	\N	fabe93f1-0ac0-4b27-836a-5b4c99a9d7af
269	emp_monthly_salary	social_security_fund_special_adjustment	社保公积金特殊调整	number	f	f	t	530	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	measure	f	\N	\N	02ffb942-a95a-4ffa-ac02-eb3fbb17da83
270	emp_monthly_salary	other_deductions	其他扣款	number	f	f	t	540	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	measure	f	\N	\N	95028448-6a6e-4bdb-b99c-eb48d052c865
271	emp_monthly_salary	tax_exempt_income_post_tax_deduction	免税收入(税后扣除)	number	f	f	t	550	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:20:35.649219+00	\N	f	\N	measure	f	\N	\N	2b5ad499-841c-4db3-ad0e-45e449b02e02
272	emp_monthly_salary	outsourcing_fee	外包费用	number	f	f	t	560	t	\N	2026-06-04 08:20:35.649219+00	2026-06-04 08:26:38.66839+00	\N	f	\N	measure	f	\N	\N	6990e0e6-d50b-4e07-9d72-cbcace6525f7
273	emp_monthly_salary	gross_salary_including_compensation	应发工资（含补偿金）	number	f	f	t	570	t	\N	2026-06-04 08:58:42.351044+00	2026-06-04 08:58:42.351044+00	\N	f	\N	measure	f	\N	\N	77d62cbf-1cfe-4d38-989a-18012a6043a1_c89caa22-bc61-4e07-a88f-9a03b3c5b337
274	emp_monthly_salary	welfare_taxable_item_universal	福利计税项（普适性福利）	number	f	f	t	580	t	\N	2026-06-04 11:04:33.055945+00	2026-06-04 11:04:33.055945+00	\N	f	\N	measure	f	\N	\N	4be9ab3c-29b8-4d9f-bb5a-b1da9b45696f
275	emp_monthly_salary	welfare_taxable_item_non_universal	福利计税项（非普适性福利）	number	f	f	t	590	t	\N	2026-06-04 11:04:33.055945+00	2026-06-04 11:04:33.055945+00	\N	f	\N	measure	f	\N	\N	db59e3de-6d2a-4a66-89bc-e447c45dec71
276	emp_monthly_salary	provident_fund_employee_total	个人住房公积金	number	f	f	t	600	t	\N	2026-06-04 12:18:47.569536+00	2026-06-04 12:18:47.569536+00	\N	f	\N	measure	f	\N	\N	a5e0481a-fb5d-4411-8bca-44f2f2337bf9
502	emp_severance_installment	installment_1	第一期发放	number	f	f	t	40	f		2026-06-10 07:16:35.940175+00	2026-06-10 07:32:34.991008+00	\N	f	null	measure	f	\N	\N	\N
9	emp_monthly_allocation	cost_period	成本归属年月	string	t	f	t	10	t	\N	2026-05-23 02:25:53.241189+00	2026-06-04 09:48:27.933557+00	\N	f	\N	dimension	f	\N	\N	3c218733-251f-4539-900c-e6fd04d8acef
11	emp_monthly_allocation	employee_no	工号	number	t	f	t	30	t	\N	2026-05-23 02:25:53.241189+00	2026-06-04 09:48:27.933557+00	\N	f	\N	measure	f	\N	\N	44e5cebb-e2fa-4b69-b0cc-8f4d20167d9f
12	emp_monthly_allocation	employee	员工	string	f	f	t	40	t	\N	2026-05-23 02:25:53.241189+00	2026-05-23 02:25:53.241189+00	\N	f	\N	dimension	f	\N	\N	1125732e-543a-417c-84e0-e664f2c24c48
152	emp_monthly_allocation	code	编码	string	f	f	t	50	t	\N	2026-06-03 11:14:35.151091+00	2026-06-03 11:35:16.517349+00	\N	f	\N	dimension	f	\N	\N	e2b8e0ef-e1ed-42a1-ad71-054b713bd651
13	emp_monthly_allocation	dimension_value	维度值	string	t	f	t	60	t	\N	2026-05-23 02:25:53.241189+00	2026-06-10 06:07:12.120732+00	\N	f	\N	dimension	f	\N	\N	bf89e524-368f-4019-a609-75c714cacea8
14	emp_monthly_allocation	headcount	系数	number	f	f	t	90	t	\N	2026-05-23 02:25:53.241189+00	2026-06-03 11:35:16.517349+00	\N	f	\N	measure	f	\N	\N	e4546fe5-bc57-41d0-ba52-949577052202
138	cost_center_monthly	month	月份	string	t	f	t	0	t	\N	2026-06-03 08:57:14.432457+00	2026-06-03 08:57:14.432457+00	\N	f	\N	dimension	f	\N	\N	\N
139	cost_center_monthly	code	编码	string	t	f	t	20	t	\N	2026-06-03 08:57:14.432457+00	2026-06-03 08:57:14.432457+00	\N	f	\N	dimension	f	\N	\N	e2b8e0ef-e1ed-42a1-ad71-054b713bd651
140	cost_center_monthly	name	名称	string	f	f	t	30	t	\N	2026-06-03 08:57:14.432457+00	2026-06-03 08:57:14.432457+00	\N	f	\N	dimension	f	\N	\N	6b088147-5dba-4ffa-88b2-deb237fe9250
146	cost_center_monthly	game_project_detail	游戏项目明细	string	f	f	t	40	f		2026-06-03 09:26:45.614795+00	2026-06-03 09:31:13.680219+00	\N	t	\N	dimension	f	\N	\N	\N
147	cost_center_monthly	standard_game_project	标准游戏项目	string	f	f	t	50	f		2026-06-03 09:27:51.393619+00	2026-06-03 10:23:26.836319+00	\N	t	\N	dimension	f	\N	\N	\N
148	cost_center_monthly	studio	工作室	string	f	f	t	50	f		2026-06-03 09:28:43.828891+00	2026-06-03 10:23:26.836319+00	\N	t	\N	dimension	f	\N	\N	\N
149	cost_center_monthly	studio_group	工作室群	string	f	f	t	60	f		2026-06-03 09:29:17.387753+00	2026-06-03 10:23:26.836319+00	\N	t	\N	dimension	f	\N	\N	\N
150	cost_center_monthly	studio_group_2	工作室群	string	f	f	t	70	f		2026-06-03 09:29:57.325013+00	2026-06-03 10:23:26.836319+00	\N	t	\N	dimension	f	\N	\N	\N
151	cost_center_monthly	status	启用状态	enum	f	f	t	80	f	\N	2026-06-03 10:16:42.709489+00	2026-06-03 10:23:09.970388+00	\N	t	["\\u542f\\u7528", "\\u505c\\u7528"]	dimension	f	\N	\N	\N
457	emp_monthly_cost_result	cost_period	成本归属年月	number	t	f	t	10	t	\N	2026-06-05 08:03:04.053943+00	2026-06-05 10:28:14.30588+00	\N	f	\N	measure	f	\N	\N	\N
458	emp_monthly_cost_result	client	甲方	string	t	f	t	20	t	\N	2026-06-05 08:03:04.053943+00	2026-06-05 10:28:14.30588+00	\N	f	\N	dimension	f	\N	\N	\N
459	emp_monthly_cost_result	expense_type	费用类型	string	t	f	t	30	t	\N	2026-06-05 08:03:04.053943+00	2026-06-05 10:28:14.30588+00	\N	f	\N	dimension	f	\N	\N	\N
460	emp_monthly_cost_result	name	名称	string	t	f	t	40	t	\N	2026-06-05 08:03:04.053943+00	2026-06-05 10:28:14.30588+00	\N	f	\N	dimension	f	\N	\N	\N
461	emp_monthly_cost_result	currency	币种(自定义)	string	t	f	t	50	t	\N	2026-06-05 08:03:04.053943+00	2026-06-05 10:28:14.30588+00	\N	f	\N	dimension	f	\N	\N	\N
462	emp_monthly_cost_result	gross_salary_including_compensation	应发工资（含补偿金）	number	f	f	t	60	t	\N	2026-06-05 08:03:04.053943+00	2026-06-05 08:03:04.053943+00	\N	f	\N	measure	f	\N	\N	\N
498	emp_monthly_cost_result	salary_bonus	应发工资（含补偿金及奖金）	number	f	f	t	70	t	\N	2026-06-09 12:41:17.388202+00	2026-06-11 03:03:45.597785+00	\N	f	\N	measure	f	\N	\N	\N
463	emp_monthly_cost_result	social_security_employee_part	社保个人部分（工资条）	number	f	f	t	80	t	\N	2026-06-05 08:03:04.053943+00	2026-06-09 12:48:39.239661+00	\N	f	\N	measure	f	\N	\N	\N
464	emp_monthly_cost_result	provident_fund_employee_total	个人住房公积金	number	f	f	t	90	t	\N	2026-06-05 08:03:04.053943+00	2026-06-09 12:48:39.239661+00	\N	f	\N	measure	f	\N	\N	\N
465	emp_monthly_cost_result	individual_income_tax_total	个税总额	number	f	f	t	100	t	\N	2026-06-05 08:03:04.053943+00	2026-06-09 12:48:39.239661+00	\N	f	\N	measure	f	\N	\N	\N
468	emp_monthly_cost_result	employer_social_security_cost	单位社保费用	number	f	f	t	130	t	\N	2026-06-05 08:03:04.053943+00	2026-06-09 12:48:39.239661+00	\N	f	\N	measure	f	\N	\N	\N
469	emp_monthly_cost_result	employer_housing_fund	单位住房公积金	number	f	f	t	140	t	\N	2026-06-05 08:03:04.053943+00	2026-06-09 12:48:39.239661+00	\N	f	\N	measure	f	\N	\N	\N
470	emp_monthly_cost_result	disability_security_contribution	残保金	number	f	f	t	150	t	\N	2026-06-05 08:03:04.053943+00	2026-06-09 12:48:39.239661+00	\N	f	\N	measure	f	\N	\N	\N
471	emp_monthly_cost_result	service_fee	服务费	number	f	f	t	160	t	\N	2026-06-05 08:03:04.053943+00	2026-06-09 12:48:39.239661+00	\N	f	\N	measure	f	\N	\N	\N
472	emp_monthly_cost_result	interest_free_loan_interest	无息借款利息	number	f	f	t	170	t	\N	2026-06-05 08:03:04.053943+00	2026-06-09 12:48:39.239661+00	\N	f	\N	measure	f	\N	\N	\N
473	emp_monthly_cost_result	housing_allowance_post_tax	住房补贴（税后）	number	f	f	t	180	t	\N	2026-06-05 08:03:04.053943+00	2026-06-09 12:48:39.239661+00	\N	f	\N	measure	f	\N	\N	\N
475	emp_monthly_cost_result	rent	房租	number	f	f	t	190	t	\N	2026-06-05 08:03:04.053943+00	2026-06-05 08:03:04.053943+00	\N	f	\N	measure	f	\N	\N	\N
474	emp_monthly_cost_result	interest_free_loan_repayment	无息借款还款	number	f	f	t	200	t	\N	2026-06-05 08:03:04.053943+00	2026-06-09 12:48:39.239661+00	\N	f	\N	measure	f	\N	\N	\N
476	emp_monthly_cost_result	property_management_fee	物业费	number	f	f	t	210	t	\N	2026-06-05 08:03:04.053943+00	2026-06-09 12:48:39.239661+00	\N	f	\N	measure	f	\N	\N	\N
477	emp_monthly_cost_result	electricity_fee	电费	number	f	f	t	220	t	\N	2026-06-05 08:03:04.053943+00	2026-06-09 12:48:39.239661+00	\N	f	\N	measure	f	\N	\N	\N
478	emp_monthly_cost_result	gas_fee	燃气费	number	f	f	t	230	t	\N	2026-06-05 08:03:04.053943+00	2026-06-09 12:48:39.239661+00	\N	f	\N	measure	f	\N	\N	\N
479	emp_monthly_cost_result	employee_card_reissue_deduction	工卡补办扣款	number	f	f	t	240	t	\N	2026-06-05 08:03:04.053943+00	2026-06-09 12:48:39.239661+00	\N	f	\N	measure	f	\N	\N	\N
480	emp_monthly_cost_result	exit_employee_card_loss_deduction	离职工卡丢失扣款	number	f	f	t	250	t	\N	2026-06-05 08:03:04.053943+00	2026-06-09 12:48:39.239661+00	\N	f	\N	measure	f	\N	\N	\N
481	emp_monthly_cost_result	didi_deduction	滴滴扣款	number	f	f	t	260	t	\N	2026-06-05 08:03:04.053943+00	2026-06-09 12:48:39.239661+00	\N	f	\N	measure	f	\N	\N	\N
482	emp_monthly_cost_result	travel_excess_deduction	差旅超标扣款	number	f	f	t	270	t	\N	2026-06-05 08:03:04.053943+00	2026-06-09 12:48:39.239661+00	\N	f	\N	measure	f	\N	\N	\N
483	emp_monthly_cost_result	fixed_asset_deduction	固定资产扣款	number	f	f	t	280	t	\N	2026-06-05 08:03:04.053943+00	2026-06-09 12:48:39.239661+00	\N	f	\N	measure	f	\N	\N	\N
484	emp_monthly_cost_result	parking_fee	停车费	number	f	f	t	290	t	\N	2026-06-05 08:03:04.053943+00	2026-06-09 12:48:39.239661+00	\N	f	\N	measure	f	\N	\N	\N
485	emp_monthly_cost_result	training_deduction	培训扣款	number	f	f	t	300	t	\N	2026-06-05 08:03:04.053943+00	2026-06-09 12:48:39.239661+00	\N	f	\N	measure	f	\N	\N	\N
486	emp_monthly_cost_result	social_security_fund_special_adjustment	社保公积金特殊调整	number	f	f	t	320	t	\N	2026-06-05 08:03:04.053943+00	2026-06-11 03:03:45.597785+00	\N	f	\N	measure	f	\N	\N	\N
487	emp_monthly_cost_result	other_deductions	其他扣款	number	f	f	t	330	t	\N	2026-06-05 08:03:04.053943+00	2026-06-11 03:03:45.597785+00	\N	f	\N	measure	f	\N	\N	\N
488	emp_monthly_cost_result	tax_exempt_income_post_tax_deduction	免税收入(税后扣除)	number	f	f	t	340	t	\N	2026-06-05 08:03:04.053943+00	2026-06-11 03:03:45.597785+00	\N	f	\N	measure	f	\N	\N	\N
489	emp_monthly_cost_result	welfare_taxable_item_universal	福利计税项（普适性福利）	number	f	f	t	350	t	\N	2026-06-05 08:03:04.053943+00	2026-06-11 03:03:45.597785+00	\N	f	\N	measure	f	\N	\N	\N
490	emp_monthly_cost_result	welfare_taxable_item_non_universal	福利计税项（非普适性福利）	number	f	f	t	360	t	\N	2026-06-05 08:03:04.053943+00	2026-06-11 03:03:45.597785+00	\N	f	\N	measure	f	\N	\N	\N
491	emp_monthly_cost_result	economic_compensation	经济补偿金	number	f	f	t	370	t	\N	2026-06-05 08:03:04.053943+00	2026-06-11 03:03:45.597785+00	\N	f	\N	measure	f	\N	\N	\N
492	emp_monthly_cost_result	headcount	人数	number	f	f	t	380	t	\N	2026-06-05 08:03:04.053943+00	2026-06-11 03:03:45.597785+00	\N	f	\N	measure	f	\N	\N	\N
466	emp_monthly_cost_result	post_tax_deductions_total	税后扣除项总额	number	f	f	t	106	t	\N	2026-06-05 08:03:04.053943+00	2026-06-11 09:37:43.729283+00	\N	f	\N	measure	f	\N	\N	\N
535	emp_monthly_cost_result	installment_2	第二期发放	string	f	f	t	108	t	\N	2026-06-11 14:14:46.076685+00	2026-06-11 14:17:03.615276+00	\N	f	\N	dimension	f	\N	\N	\N
536	emp_monthly_cost_result	installment_3	第三期发放	string	f	f	t	109	t	\N	2026-06-11 14:14:46.076685+00	2026-06-11 14:17:03.615276+00	\N	f	\N	dimension	f	\N	\N	\N
537	emp_monthly_cost_result	installment_4	第四期发放	string	f	f	t	110	t	\N	2026-06-11 14:14:46.076685+00	2026-06-11 14:17:03.615276+00	\N	f	\N	dimension	f	\N	\N	\N
\.


--
-- Name: dataset_calculated_fields_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.dataset_calculated_fields_id_seq', 2, true);


--
-- Name: dataset_tables_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.dataset_tables_id_seq', 94, true);


--
-- Name: datasets_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.datasets_id_seq', 12, true);


--
-- Name: field_categories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.field_categories_id_seq', 3, true);


--
-- Name: registered_tables_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.registered_tables_id_seq', 11, true);


--
-- Name: table_columns_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.table_columns_id_seq', 537, true);


--
-- PostgreSQL database dump complete
--

\unrestrict opBMV71Phd6OBdX9RYDeJ7uUVqJ0f5cvWmZ5xiur3nVJfPrWWHA82nhfCqVxFSX
