import os
import sys
import schedule
import time
import logging
from datetime import datetime, timedelta

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models import db

# Use the root logger configured by logger.setup_logging()
# (falls back to basicConfig defaults when run standalone)
logger = logging.getLogger(__name__)

class DashboardRefresher:
    def __init__(self):
        # Initialize Flask app context
        from app import create_app
        self.app = create_app('default')
        
    def refresh_dashboard_data(self):
        """Refresh dashboard by reconciling daily summaries"""
        with self.app.app_context():
            try:
                logger.info("Refreshing dashboard data...")
                
                # Reconcile yesterday's daily summary (safety net)
                try:
                    from services.aggregation_service import update_daily_summary
                    yesterday = datetime.now() - timedelta(days=1)
                    update_daily_summary(yesterday.date())
                    logger.info(f"Reconciled daily summary for {yesterday.date()}")
                    
                    # Also reconcile today (in case of missed updates)
                    update_daily_summary()
                    logger.info(f"Reconciled daily summary for today")
                except Exception as e:
                    logger.error(f"Aggregation reconciliation error: {e}")
                
                logger.info("Dashboard maintenance completed")
                return True
                
            except Exception as e:
                logger.error(f"Error refreshing dashboard: {e}")
                return False
    
    def daily_refresh_and_archive(self):
        """Main function to refresh dashboard"""
        try:
            logger.info("=" * 60)
            logger.info("Starting Daily Dashboard Refresh")
            logger.info("=" * 60)
            
            # Refresh dashboard
            refresh_success = self.refresh_dashboard_data()
            
            if refresh_success:
                logger.info("Daily refresh completed successfully")
            else:
                logger.error("Some operations failed during daily refresh")
            
            logger.info("=" * 60)
            
        except Exception as e:
            logger.error(f"Error in daily refresh: {e}")
    
    def start_scheduler(self):
        """Start the scheduler"""
        logger.info("Starting Dashboard Refresh Scheduler...")
        logger.info(f"Dashboard will run maintenance daily at 12:01 AM")
        
        # Schedule job for 12:01 AM every day (start of new day)
        schedule.every().day.at("00:01").do(self.daily_refresh_and_archive)
        
        # Run scheduler continuously
        while True:
            schedule.run_pending()
            time.sleep(60)  # Check every minute
    
    def run_immediate(self):
        """Run refresh immediately (for testing)"""
        logger.info("Running immediate dashboard refresh...")
        self.daily_refresh_and_archive()

def main():
    """Main entry point"""
    try:
        refresher = DashboardRefresher()
        
        if len(sys.argv) > 1 and sys.argv[1] == '--immediate':
            # Run immediately for testing
            refresher.run_immediate()
        else:
            # Start scheduler
            refresher.start_scheduler()
            
    except KeyboardInterrupt:
        logger.info("Scheduler stopped by user")
    except Exception as e:
        logger.error(f"❌ Fatal error: {e}")

if __name__ == "__main__":
    main()
