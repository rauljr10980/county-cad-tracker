#!/usr/bin/env python3
"""
County CAD Tracker - Auto Dialer
---------------------------------
Registers as a dialer:// protocol handler and auto-dials numbers via Google Voice.

SETUP (run once):
    python dialer.py --register

USAGE:
    Triggered automatically by the "Start Dialing" button in the app.
    Or manually:
    python dialer.py "dialer://start?numbers=2105551234|2105556789&names=John+Smith|Jane+Doe"

REQUIREMENTS:
    pip install playwright
    playwright install chromium
"""

import sys
import asyncio
import urllib.parse
import os


def register_protocol():
    """Register dialer:// protocol handler on Windows."""
    try:
        import winreg
    except ImportError:
        print("Windows registry not available. On Mac/Linux, see README for manual setup.")
        return

    python_exe = sys.executable
    script_path = os.path.abspath(__file__)
    command = f'"{python_exe}" "{script_path}" "%1"'

    key_path = r'SOFTWARE\Classes\dialer'
    try:
        key = winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path)
        winreg.SetValue(key, '', winreg.REG_SZ, 'URL:Dialer Protocol')
        winreg.SetValueEx(key, 'URL Protocol', 0, winreg.REG_SZ, '')
        winreg.CloseKey(key)

        cmd_key = winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path + r'\shell\open\command')
        winreg.SetValue(cmd_key, '', winreg.REG_SZ, command)
        winreg.CloseKey(cmd_key)

        print(f'Protocol registered successfully!')
        print(f'Command: {command}')
        print(f'\nYou can now use the "Start Dialing" button in the app.')
    except Exception as e:
        print(f'Failed to register protocol: {e}')
        print('Try running as Administrator.')


async def dial_numbers(contacts):
    """Auto-dial a list of contacts via Google Voice using Playwright."""
    from playwright.async_api import async_playwright

    if not contacts:
        print('No contacts to dial.')
        return

    print(f'\nStarting dialer with {len(contacts)} number(s)...')
    for c in contacts:
        print(f'  - {c["name"] or "Unknown"}: {c["phone"]}')

    async with async_playwright() as p:
        # Launch Chrome (non-headless so you can see and interact)
        browser = await p.chromium.launch(
            headless=False,
            channel='chrome',
            args=['--start-maximized']
        )
        context = await browser.new_context(no_viewport=True)
        page = await context.new_page()

        print('\nOpening Google Voice...')
        await page.goto('https://voice.google.com')

        # Give user time to log in if needed
        print('Waiting for Google Voice to load (log in if prompted)...')
        try:
            await page.wait_for_url('**/voice.google.com/**', timeout=60000)
            await asyncio.sleep(2)
        except Exception:
            print('Timed out waiting for Google Voice. Make sure you are logged in.')
            await browser.close()
            return

        for i, contact in enumerate(contacts):
            name = contact.get('name') or 'Unknown'
            phone = contact.get('phone', '')

            # Clean to digits only
            digits = ''.join(c for c in phone if c.isdigit())
            if len(digits) == 10:
                digits = '1' + digits

            if not digits:
                print(f'\n[{i+1}/{len(contacts)}] Skipping {name} — invalid number: {phone}')
                continue

            print(f'\n[{i+1}/{len(contacts)}] Calling {name}: +{digits}')

            call_url = f'https://voice.google.com/u/0/calls?a=nc,+{digits}'
            await page.goto(call_url)
            await asyncio.sleep(3)

            # Try to detect call state via "End call" button
            call_detected = False
            try:
                # Wait for end call button to appear (call is active)
                await page.wait_for_selector(
                    '[aria-label="End call"], [data-tooltip="End call"], button:has-text("End call")',
                    timeout=15000
                )
                call_detected = True
                print(f'  Call active...')

                # Wait for it to disappear (call ended)
                await page.wait_for_selector(
                    '[aria-label="End call"], [data-tooltip="End call"], button:has-text("End call")',
                    state='detached',
                    timeout=600000  # 10 min max per call
                )
                print(f'  Call ended.')

            except Exception:
                if call_detected:
                    print(f'  Call ended (selector timeout).')
                else:
                    print(f'  Could not detect call state — waiting 10 seconds...')
                    await asyncio.sleep(10)

            # Pause between calls
            if i < len(contacts) - 1:
                print(f'  Next call in 2 seconds...')
                await asyncio.sleep(2)

        print('\n\nAll numbers called!')
        input('Press Enter to close the browser...')
        await browser.close()


def parse_url(url):
    """Parse dialer:// URL and extract contacts list."""
    # Remove the dialer:// prefix and decode
    parsed = urllib.parse.urlparse(url)
    params = urllib.parse.parse_qs(parsed.query)

    numbers_raw = params.get('numbers', [''])[0]
    names_raw = params.get('names', [''])[0]

    phones = [urllib.parse.unquote_plus(p) for p in numbers_raw.split('|') if p]
    names = [urllib.parse.unquote_plus(n) for n in names_raw.split('|')] if names_raw else []

    contacts = [
        {
            'name': names[i] if i < len(names) else '',
            'phone': phones[i]
        }
        for i in range(len(phones))
    ]

    return contacts


if __name__ == '__main__':
    if len(sys.argv) < 2 or sys.argv[1] in ('-h', '--help'):
        print(__doc__)
        sys.exit(0)

    arg = sys.argv[1]

    if arg == '--register':
        register_protocol()

    elif arg.startswith('dialer://'):
        contacts = parse_url(arg)
        asyncio.run(dial_numbers(contacts))

    else:
        print(f'Unknown argument: {arg}')
        print('Run with --help for usage.')
        sys.exit(1)
