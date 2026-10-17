import unittest
from flask import Flask
from models import db
from agents.domain_agents import (
    get_billing_agent,
    get_inventory_agent,
    get_product_agent,
    get_worker_agent,
    get_expense_agent,
    get_analytics_agent,
    get_reminder_agent,
    get_prediction_agent,
    _describe_tools,
)


class TestSystemPrompts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = Flask(__name__)
        cls.app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
        cls.app.config["SQLALCHEMY_BINDS"] = {"profile": "sqlite:///:memory:"}
        cls.app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
        db.init_app(cls.app)
        with cls.app.app_context():
            db.create_all()

    def test_all_domain_agents_assembled_prompts(self):
        """Verify that every domain agent dynamically incorporates schema context, rules, and tool inventory."""
        with self.app.app_context():
            agents = [
                get_billing_agent(),
                get_inventory_agent(),
                get_product_agent(),
                get_worker_agent(),
                get_expense_agent(),
                get_analytics_agent(),
                get_reminder_agent(),
                get_prediction_agent(),
            ]

            for agent in agents:
                prompt = agent.system_prompt
                self.assertIn("IDENTITY & SCOPE:", prompt, f"{agent.name} missing IDENTITY & SCOPE")
                self.assertIn(
                    "DATA MODEL CONTEXT:", prompt, f"{agent.name} missing DATA MODEL CONTEXT"
                )
                self.assertIn(
                    "BUSINESS RULES SPECIFIC TO INFOOS:",
                    prompt,
                    f"{agent.name} missing BUSINESS RULES",
                )
                self.assertIn("WORKED EXAMPLES:", prompt, f"{agent.name} missing WORKED EXAMPLES")
                self.assertIn(
                    "TOOLS AVAILABLE TO YOU:", prompt, f"{agent.name} missing dynamic tool list"
                )

                # Verify each tool name assigned to the agent appears in its system_prompt
                for tool in agent.tools:
                    self.assertIn(
                        f"- {tool['name']}:",
                        prompt,
                        f"Tool {tool['name']} not described in {agent.name} prompt",
                    )

    def test_describe_tools_helper(self):
        """Verify _describe_tools format output."""
        sample_tools = [
            {"name": "lookup_item", "description": "Find item by name"},
            {"name": "propose_sale", "description": "Propose recording sale"},
        ]
        desc = _describe_tools(sample_tools)
        self.assertIn("TOOLS AVAILABLE TO YOU:", desc)
        self.assertIn("- lookup_item: Find item by name", desc)
        self.assertIn("- propose_sale: Propose recording sale", desc)

    def test_orchestrator_prompt_profile_grounding(self):
        """Verify that the Orchestrator system prompt includes profile.db grounding and applications."""
        from agents.domain_agents import OrchestratorAgent

        with self.app.app_context():
            prompt = OrchestratorAgent.get_orchestrator_prompt()
            self.assertIn("LIVE STORE CONTEXT (profile.db):", prompt)
            self.assertIn("STORE PROFILE DATABASE (profile.db) APPLICATIONS & USE CASES:", prompt)
            self.assertIn("AI Applications of profile.db:", prompt)
            self.assertIn("DOMAINS AND WHAT THEY OWN:", prompt)
            self.assertIn("prediction — forecasting future sales revenue", prompt)
            self.assertIn("prediction", OrchestratorAgent.AGENT_MAP)

    def test_deterministic_prediction_routing(self):
        """Verify that fast-path deterministic intent routing routes prediction queries correctly."""
        from agents.fast_path import classify_intent_deterministic

        queries = [
            ("predict sales for next week", "prediction"),
            ("forecast tomorrow sales", "prediction"),
            ("how will sales be this weekend", "prediction"),
            ("weather forecast for our store", "prediction"),
            ("upcoming festivals", "prediction"),
            ("what were today's sales", "analytics"),
        ]
        for query, expected in queries:
            domain = classify_intent_deterministic(query)
            self.assertEqual(domain, expected, f"Query '{query}' routed to {domain}, expected {expected}")


if __name__ == "__main__":
    unittest.main()
