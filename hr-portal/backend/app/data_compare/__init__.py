"""数据对比检查模块 — 参数化模板引擎方案

模型只输出 CompareSpec JSON，后端编译器填参生成 SQL，零注入风险。
三类模板：roster（名单对比）/ field（字段对比）/ amount（金额对比）
"""
