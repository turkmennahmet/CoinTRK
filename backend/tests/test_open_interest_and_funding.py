import pytest

from app.clients.models import PremiumIndex
from app.schemas.common import ResponseMeta
from app.schemas.open_interest import OIPeriod, OpenInterestResponse, PositioningBias
from app.services.funding import annualize, build_funding_row
from app.services.open_interest import build_oi_row, classify_bias, with_period

from .factories import oi_points, symbol_info, ticker


@pytest.mark.parametrize(
    ("oi", "price", "expected"),
    [
        (5.0, 2.0, PositioningBias.LONG_BUILDUP),
        (5.0, -2.0, PositioningBias.SHORT_BUILDUP),
        (-5.0, 2.0, PositioningBias.SHORT_COVERING),
        (-5.0, -2.0, PositioningBias.LONG_UNWINDING),
        (0.1, 5.0, None),
        (None, 5.0, None),
    ],
)
def test_classify_bias(oi, price, expected):
    assert classify_bias(oi, price) == expected


def test_build_oi_row_computes_fixed_windows_and_implied_price():
    # 169 hourly points: flat, then +10% OI and -5% price in the last hour.
    values = [1000.0] * 168 + [1100.0]
    prices = [10.0] * 168 + [9.5]
    quarter = oi_points([1050.0, 1100.0], [9.8, 9.5])
    row = build_oi_row(
        symbol_info(), ticker(quote_volume=2200.0), (oi_points(values, prices), quarter), 0.0001
    )

    assert row is not None
    changes = {c.window: c for c in row.changes}
    assert [c.window for c in row.changes] == list(OIPeriod)
    assert changes[OIPeriod.M15].oi_change_pct == pytest.approx(50 / 1050 * 100, abs=1e-3)
    assert changes[OIPeriod.H1].oi_change_pct == pytest.approx(10.0)
    assert changes[OIPeriod.H1].price_change_pct == pytest.approx(-5.0)
    assert changes[OIPeriod.W1].oi_change_pct == pytest.approx(10.0)
    assert row.bias == PositioningBias.SHORT_BUILDUP  # default 4h window
    assert row.oi_to_volume == pytest.approx(0.5)
    assert row.funding_rate_pct == pytest.approx(0.01)


def test_build_oi_row_handles_short_history():
    row = build_oi_row(symbol_info(), ticker(), (oi_points([1.0, 2.0], [1.0, 1.0]), []), None)
    assert row is not None
    changes = {c.window: c for c in row.changes}
    assert changes[OIPeriod.H1].oi_change_pct == pytest.approx(100.0)
    assert changes[OIPeriod.H4].oi_change_pct is None
    assert changes[OIPeriod.M15].oi_change_pct is None
    assert build_oi_row(symbol_info(), ticker(), ([], []), None) is None


def test_with_period_rereads_bias_from_the_chosen_window():
    # OI up over the last hour with rising price, but down over the day.
    values = [1200.0] * 145 + [1000.0] * 23 + [1100.0]
    prices = [10.0] * 168 + [10.5]
    row = build_oi_row(symbol_info(), ticker(), (oi_points(values, prices), []), None)
    assert row is not None
    scan = OpenInterestResponse(
        period=OIPeriod.H4, meta=ResponseMeta(generated_at=0, universe_size=1), rows=[row]
    )
    assert with_period(scan, OIPeriod.H1).rows[0].bias == PositioningBias.LONG_BUILDUP
    daily = with_period(scan, OIPeriod.D1)
    assert daily.period == OIPeriod.D1
    assert daily.rows[0].bias == PositioningBias.SHORT_COVERING


def test_funding_annualisation_respects_interval():
    assert annualize(0.01, 8) == pytest.approx(10.95)
    assert annualize(0.01, 4) == pytest.approx(21.9)

    premium = PremiumIndex("BTCUSDT", 100.0, 100.0, 0.0001, 0)
    row = build_funding_row(symbol_info(), premium, ticker(), interval_hours=8)
    assert row.funding_rate_pct == pytest.approx(0.01)
    assert row.apr_pct == pytest.approx(10.95)
