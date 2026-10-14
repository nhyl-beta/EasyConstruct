import asyncio, json, sys
from aiosmtpd.controller import Controller
from aiosmtpd.smtp import AuthResult, LoginPassword
box = []
class H:
    async def handle_DATA(self, server, session, envelope):
        box.append({"from": envelope.mail_from, "to": envelope.rcpt_tos, "data": envelope.content.decode("utf8", "replace")})
        json.dump(box, open("/tmp/claude-0/ui/mailbox.json", "w")); return "250 OK"
def auth(server, session, envelope, mechanism, data):
    return AuthResult(success=True)
c = Controller(H(), hostname="127.0.0.1", port=2525, authenticator=auth, auth_required=False, auth_require_tls=False)
c.start(); print("sink up", flush=True)
import time
while True: time.sleep(1)
