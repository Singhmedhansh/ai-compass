from app import create_app
app = create_app()
client = app.test_client()
print('Before:', list(client._cookies.keys()))
with client.session_transaction() as sess:
    sess['_user_id'] = '1'
print('After:', list(client._cookies.keys()))
print('Cookies dict:', client._cookies)
