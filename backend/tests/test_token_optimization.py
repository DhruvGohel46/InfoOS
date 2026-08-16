import unittest
from datetime import datetime, date
from app import create_app
from models import db, AgentConfig, AgentPermission, AgentActionLog, Product, Inventory, Worker
from agents.pricing import calculate_cost, MODEL_PRICING
from agents.fast_path import classify_intent_deterministic, try_zero_cost_fast_path
from agents.tools import execute_read_tool, execute_mutating_tool, clear_tool_cache, _TOOL_CACHE
from agents.domain_agents import DomainAgent, OrchestratorAgent


class TokenOptimizationTestSuite(unittest.TestCase):
    def setUp(self):
        from app import run_programmatic_sqlite_migrations

        self.app = create_app("default")
        self.client = self.app.test_client()
        self.ctx = self.app.app_context()
        self.ctx.push()
        db.create_all()
        run_programmatic_sqlite_migrations(self.app, db)

    def tearDown(self):
        db.session.remove()
        self.ctx.pop()

    def test_01_pricing_calculations(self):
        """Test static model pricing and token cost estimation."""
        # 1. GPT-4o-mini (0.15 / 0.60 per 1M)
        cost_gpt4o_mini = calculate_cost(
            "openai", "gpt-4o-mini", input_tokens=1000, output_tokens=500
        )
        expected = (1000 / 1_000_000 * 0.15) + (500 / 1_000_000 * 0.60)
        self.assertAlmostEqual(cost_gpt4o_mini, expected, places=6)

        # 2. Claude 3.5 Sonnet (3.00 / 15.00 per 1M)
        cost_claude = calculate_cost(
            "anthropic", "claude-3-5-sonnet", input_tokens=2000, output_tokens=1000
        )
        expected_claude = (2000 / 1_000_000 * 3.00) + (1000 / 1_000_000 * 15.00)
        self.assertAlmostEqual(cost_claude, expected_claude, places=6)

        # 3. Gemini 1.5 Flash (0.075 / 0.30 per 1M)
        cost_gemini = calculate_cost(
            "google", "gemini-1.5-flash", input_tokens=10000, output_tokens=2000
        )
        expected_gemini = (10000 / 1_000_000 * 0.075) + (2000 / 1_000_000 * 0.30)
        self.assertAlmostEqual(cost_gemini, expected_gemini, places=6)

    def test_02_deterministic_intent_classification(self):
        """Test pre-LLM regex classification without calling an LLM."""
        self.assertEqual(classify_intent_deterministic("How much did we sell today?"), "analytics")
        self.assertEqual(classify_intent_deterministic("Who is present today?"), "worker")
        self.assertEqual(classify_intent_deterministic("Check low stock items"), "inventory")
        self.assertEqual(
            classify_intent_deterministic("Add a new product Pizza Margherita"), "product"
        )
        self.assertEqual(
            classify_intent_deterministic("Log expense for electricity bill"), "expense"
        )
        self.assertEqual(
            classify_intent_deterministic("Remind me to call supplier at 4 PM"), "reminder"
        )
        self.assertEqual(classify_intent_deterministic("Create a bill for table 5"), "billing")

    def test_03_zero_cost_fast_path(self):
        """Test zero-token fast-path short circuit for common business questions."""
        # 1. Sales summary
        fast_res = try_zero_cost_fast_path("today's sales")
        self.assertIsNotNone(fast_res)
        self.assertTrue(fast_res["handled"])
        self.assertEqual(fast_res["input_tokens"], 0)
        self.assertEqual(fast_res["output_tokens"], 0)
        self.assertEqual(fast_res["estimated_cost"], 0.0)

        # 2. Staff Attendance
        fast_res2 = try_zero_cost_fast_path("who is present today")
        self.assertIsNotNone(fast_res2)
        self.assertEqual(fast_res2["agent"], "worker")
        self.assertEqual(fast_res2["input_tokens"], 0)

        # 3. Low stock check
        fast_res3 = try_zero_cost_fast_path("check low stock items")
        self.assertIsNotNone(fast_res3)
        self.assertEqual(fast_res3["agent"], "inventory")
        self.assertEqual(fast_res3["estimated_cost"], 0.0)

    def test_04_session_tool_caching_and_flushing(self):
        """Test in-memory tool caching and cache invalidation on mutations."""
        clear_tool_cache()

        # Seed sample product
        p = Product.query.filter_by(product_id="TEST_COFFEE").first()
        if not p:
            p = Product(product_id="TEST_COFFEE", name="Cold Coffee", price=90.0, active=True)
            db.session.add(p)
            db.session.commit()

        # Execute read tool
        res1 = execute_read_tool("lookup_product", {"query": "Cold Coffee"})
        self.assertIn("products", res1)

        # Confirm cache is populated
        self.assertTrue(len(_TOOL_CACHE) >= 1)

        # Cache hit
        res2 = execute_read_tool("lookup_product", {"query": "Cold Coffee"})
        self.assertEqual(res1, res2)

        # Mutating tool execution flushes cache
        execute_mutating_tool(
            "propose_adjust_stock", {"product_id": "TEST_COFFEE", "delta_quantity": 10}
        )
        self.assertEqual(len(_TOOL_CACHE), 0)

        # Cleanup test fixture
        test_p = Product.query.filter_by(product_id="TEST_COFFEE").first()
        if test_p:
            db.session.delete(test_p)
            db.session.commit()

    def test_05_rolling_window_context_pruning(self):
        """Test context compression when chat history exceeds 6 turns."""
        agent = DomainAgent("test_agent", "System instruction.", [])
        history = [{"role": "user", "content": f"User message {i}"} for i in range(12)]
        messages = agent._build_context_messages("Latest question", history)

        # System prompt + 1 summary memo + 6 recent turns + 1 latest question = 9
        self.assertEqual(len(messages), 9)
        self.assertEqual(messages[0]["role"], "system")
        self.assertIn("Context note", messages[1]["content"])
        self.assertEqual(messages[-1]["content"], "Latest question")


if __name__ == "__main__":
    unittest.main()
