"""
requests==2.18.4
flask==1.0.2
"""

import requests

def app(env, start_response):
    """
        Simple server that proxies example.org
        see how much cleaner this code is than
        the javascript counter part? </joke>
    """
    a = requests.get('https://example.org')
    html = str(a.text)

    start_response("200 Ok", [
        ('Content-type', 'text/html'),
        ('Content-Length', len(html))
    ]);

    return [html]
