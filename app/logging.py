import logging
import sys
from pythonjsonlogger import jsonlogger
from flask import request

class CustomJsonFormatter(jsonlogger.JsonFormatter):
    def add_fields(self, log_record, record, message_dict):
        super(CustomJsonFormatter, self).add_fields(log_record, record, message_dict)
        if not log_record.get('timestamp'):
            log_record['timestamp'] = self.formatTime(record, self.datefmt)
        if log_record.get('level'):
            log_record['level'] = log_record['level'].upper()
        else:
            log_record['level'] = record.levelname

def setup_logging(app):
    handler = logging.StreamHandler(sys.stdout)
    formatter = CustomJsonFormatter('%(timestamp)s %(level)s %(name)s %(module)s %(message)s')
    handler.setFormatter(formatter)
    
    app.logger.handlers = [] # Clear default handlers
    app.logger.addHandler(handler)
    app.logger.setLevel(logging.INFO if not app.config.get('DEBUG') else logging.DEBUG)
    
    werkzeug_logger = logging.getLogger('werkzeug')
    werkzeug_logger.handlers = []
    werkzeug_logger.addHandler(handler)
    werkzeug_logger.setLevel(logging.INFO)
    
    from app.client_ip import client_ip

    @app.after_request
    def log_request_info(response):
        # Prevent static files from flooding the logs
        if not request.path.startswith('/static/'):
            app.logger.info(
                "Request handled",
                extra={
                    'method': request.method,
                    'path': request.path,
                    'status': response.status_code,
                    # remote_addr is the proxy behind Cloudflare/Render, so
                    # every line logged the same address and the access log
                    # could not distinguish one caller from another — which is
                    # exactly what you need it for after an incident.
                    'ip': client_ip(request)
                }
            )
        return response
