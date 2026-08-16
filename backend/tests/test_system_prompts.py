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
    _describe_tools,
)


class TestSystemPrompts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = Flask(__name__)
        cls.app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
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


if __name__ == "__main__":
    unittest.main()
