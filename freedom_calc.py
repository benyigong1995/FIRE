"""
财务自由计算器（命令行）

给定：当前年龄、当前存款、预期寿命、通胀率、理财回报率（年化），
输出：在剩余寿命内可持续的、以今日购买力计的每月可支配收入。

方法：先将名义年化回报率与通胀率折算为真实年化收益率，再换算为月度真实收益率，
在固定期限年金现值公式中反解每月领取额。

公式（以月为计息期）：
  PV = w * [1 - (1 + r_m)^(-N)] / r_m
  => w = PV * r_m / [1 - (1 + r_m)^(-N)]
其中：
  PV 为当前存款（以今日购买力计），
  r_m 为月度真实收益率，
  N 为剩余月数（(预期寿命-当前年龄)*12）。

注意：输出为“以今日购买力计”的金额。如果希望名义金额，可根据通胀进行再换算。
"""

from __future__ import annotations

import argparse
import math
from typing import Tuple


def calculate_monthly_spendable_income(
    current_age_years: float,
    current_savings: float,
    life_expectancy_age_years: float,
    annual_inflation_rate: float,
    annual_nominal_return_rate: float,
) -> float:
    """计算在剩余寿命内可持续的每月可支配收入（以今日购买力计）。

    参数：
      current_age_years: 当前年龄（岁）
      current_savings: 当前存款（货币单位）
      life_expectancy_age_years: 预期寿命（岁）
      annual_inflation_rate: 年化通胀率（小数，如 0.025 表示 2.5%）
      annual_nominal_return_rate: 年化名义理财回报率（小数，如 0.05 表示 5%）

    返回：
      每月可支配收入（以今日购买力计）
    """

    if current_savings <= 0:
        return 0.0

    remaining_years = life_expectancy_age_years - current_age_years
    if remaining_years <= 0:
        # 没有剩余期限时，按 0 处理（或一次性全部花费，这里返回 0）
        return 0.0

    # 真实年化收益率
    real_annual_return = (1.0 + annual_nominal_return_rate) / (1.0 + annual_inflation_rate) - 1.0

    # 月度真实收益率（按有效年利率换算为月利率）
    real_monthly_return = (1.0 + real_annual_return) ** (1.0 / 12.0) - 1.0

    remaining_months = int(math.floor(remaining_years * 12.0))
    remaining_months = max(remaining_months, 1)

    # 处理接近 0 的利率，避免数值不稳定
    if abs(real_monthly_return) < 1e-12:
        return current_savings / float(remaining_months)

    discount_factor = 1.0 - (1.0 + real_monthly_return) ** (-remaining_months)
    monthly_income = current_savings * real_monthly_return / discount_factor
    return float(max(monthly_income, 0.0))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "根据年龄、存款、预期寿命、通胀率、理财回报率，计算每月可支配收入（以今日购买力计）。"
        )
    )
    parser.add_argument("--age", type=float, required=True, help="当前年龄（岁）")
    parser.add_argument("--savings", type=float, required=True, help="当前存款（货币单位）")
    parser.add_argument(
        "--life",
        type=float,
        required=True,
        help="预期寿命（岁），用于计算剩余年限",
    )
    parser.add_argument(
        "--inflation",
        type=float,
        required=True,
        help="年化通胀率（百分数，如 2.5 表示 2.5%%）",
    )
    parser.add_argument(
        "--return",
        dest="ret",
        type=float,
        required=True,
        help="年化名义理财回报率（百分数，如 5 表示 5%%）",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    age = float(args.age)
    savings = float(args.savings)
    life = float(args.life)
    inflation_pct = float(args.inflation)
    return_pct = float(args.ret)

    # 将百分数字段换算为小数
    inflation_rate = inflation_pct / 100.0
    nominal_return_rate = return_pct / 100.0

    monthly_income = calculate_monthly_spendable_income(
        current_age_years=age,
        current_savings=savings,
        life_expectancy_age_years=life,
        annual_inflation_rate=inflation_rate,
        annual_nominal_return_rate=nominal_return_rate,
    )

    print(f"每月可支配收入（以今日购买力计）：¥{monthly_income:,.2f}")


if __name__ == "__main__":
    main()


