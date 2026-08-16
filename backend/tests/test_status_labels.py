import unittest
from agents.tools import AgentToolRegistry
from agents.status_labels import (
    TOOL_STATUS_LABELS,
    DEFAULT_STATUS_LABEL,
    ROUTING_LABEL,
    LLM_CALL_LABEL,
    SYNTHESIS_LABEL,
    get_status_label,
)


class TestStatusLabels(unittest.TestCase):
    def test_all_registered_tools_have_status_labels(self):
        """Every tool registered in AgentToolRegistry MUST have a human-readable live status label."""
        all_tools = set(AgentToolRegistry.all_tool_names())
        labeled_tools = set(TOOL_STATUS_LABELS.keys())

        missing = all_tools - labeled_tools
        self.assertEqual(
            missing,
            set(),
            f"The following tools are registered in AgentToolRegistry but missing from TOOL_STATUS_LABELS: {missing}",
        )

    def test_unmapped_tool_fallback(self):
        """Unmapped or unknown tool name should safely fall back to DEFAULT_STATUS_LABEL without crashing."""
        label = get_status_label("completely_unknown_tool_xyz")
        self.assertEqual(label, DEFAULT_STATUS_LABEL)

    def test_known_tool_labels(self):
        """Spot check known tool status labels."""
        self.assertEqual(get_status_label("lookup_product"), "Checking the price list…")
        self.assertEqual(get_status_label("get_inventory_status"), "Checking stock levels…")
        self.assertEqual(get_status_label("propose_create_worker"), "Setting up the new worker…")
        self.assertEqual(get_status_label("get_sales_kpi_summary"), "Looking at sales KPIs…")


if __name__ == "__main__":
    unittest.main()
