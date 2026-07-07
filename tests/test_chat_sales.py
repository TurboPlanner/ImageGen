"""
Tests for Generative UI Chat — Sales Query feature.

Tests:
1. SQLite sales table exists and has test data
2. Query_Sales tool returns correct data
3. Proxy endpoint returns sales data
4. Artifact file with safeApiCall exists and has correct structure
"""

import json
import sqlite3
from pathlib import Path

import pytest

PROJECT_DIR = Path(__file__).resolve().parent.parent
DB_PATH = PROJECT_DIR / "artifacts.db"
ARTIFACTS_DIR = PROJECT_DIR / "spa" / "artifacts"


# ── fixtures ──────────────────────────────────────────────────


@pytest.fixture(scope="module")
def db():
    """Connect to the SQLite database and ensure sales table exists."""
    # Import and run init_db to ensure tables exist
    from chat_server import init_db
    init_db()

    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    yield conn
    conn.close()


# ── unit tests ────────────────────────────────────────────────


class TestSalesTable:
    """Verify the sales table exists and has test data."""

    def test_sales_table_exists(self, db):
        rows = db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='sales'"
        ).fetchall()
        assert len(rows) == 1, "sales table not found"

    def test_sales_has_columns(self, db):
        cols = [r[1] for r in db.execute("PRAGMA table_info(sales)").fetchall()]
        expected = {"id", "category", "product", "amount", "sale_date"}
        assert expected.issubset(set(cols)), f"Missing columns. Found: {cols}"

    def test_sales_has_test_data(self, db):
        count = db.execute("SELECT COUNT(*) FROM sales").fetchone()[0]
        assert count > 0, "sales table is empty"
        assert count >= 12, f"Expected at least 12 rows, got {count}"

    def test_sales_categories(self, db):
        rows = db.execute(
            "SELECT category, COUNT(*) as cnt FROM sales GROUP BY category ORDER BY cnt"
        ).fetchall()
        cats = [r["category"] for r in rows]
        assert "Electronics" in cats
        assert "Clothing" in cats
        assert "Food" in cats
        assert "Books" in cats

    def test_sales_amounts_positive(self, db):
        rows = db.execute("SELECT amount FROM sales").fetchall()
        assert all(r["amount"] > 0 for r in rows), "All amounts should be positive"

    def test_sales_group_by_category(self, db):
        """Verify the query the agent will likely use."""
        rows = db.execute(
            "SELECT category, SUM(amount) as total FROM sales GROUP BY category ORDER BY total DESC"
        ).fetchall()
        assert len(rows) == 4  # 4 categories
        totals = {r["category"]: r["total"] for r in rows}
        assert totals["Electronics"] > totals["Clothing"]
        assert totals["Clothing"] > totals["Food"]


class TestToolQuerySales:
    """Test the Query_Sales tool logic directly."""

    def test_tool_query_valid(self):
        """Import and test the tool function."""
        from chat_server import tool_query_sales

        result = tool_query_sales(
            "SELECT category, SUM(amount) as total FROM sales GROUP BY category ORDER BY total DESC"
        )
        # Need to await async function
        import asyncio
        res = asyncio.run(result)

        assert res["success"] is True
        assert res["row_count"] == 4
        assert len(res["data"]) == 4

    def test_tool_query_rejects_non_select(self):
        from chat_server import tool_query_sales
        import asyncio

        result = asyncio.run(tool_query_sales("DELETE FROM sales"))
        assert result["success"] is False
        assert "SELECT" in result["error"]

    def test_tool_query_top_products(self):
        from chat_server import tool_query_sales
        import asyncio

        result = asyncio.run(
            tool_query_sales("SELECT product, amount FROM sales ORDER BY amount DESC LIMIT 3")
        )
        assert result["success"] is True
        assert result["row_count"] == 3
        # Laptop (89000) should be first
        assert result["data"][0]["product"] == "Laptop"


class TestArtifactFile:
    """Verify the sales pie chart artifact exists and uses safeApiCall."""

    def test_artifact_file_exists(self):
        path = ARTIFACTS_DIR / "sales_pie_chart.jsx"
        assert path.exists(), f"Artifact file not found: {path}"

    def test_artifact_uses_safe_api_call(self):
        path = ARTIFACTS_DIR / "sales_pie_chart.jsx"
        code = path.read_text(encoding="utf-8")
        assert "safeApiCall" in code, "Artifact must use window.safeApiCall"
        assert "query_sales" in code, "Artifact must call query_sales endpoint"
        assert "export default function App" in code, "Artifact must export App component"


class TestProxyEndpoint:
    """Test the proxy endpoint logic directly."""

    def test_proxy_query_sales(self):
        from chat_server import _query_sales_proxy

        result = _query_sales_proxy(
            "SELECT category, SUM(amount) as total FROM sales GROUP BY category ORDER BY total DESC"
        )
        assert len(result) == 4
        cats = [r["category"] for r in result]
        assert cats == ["Electronics", "Clothing", "Food", "Books"] or sorted(cats) == sorted(
            ["Electronics", "Clothing", "Food", "Books"]
        )
