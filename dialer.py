#!/usr/bin/env python3
"""
County CAD Tracker - Auto Dialer
---------------------------------
Opens Google Voice in your default browser for each number.
Press ENTER in this window to move to the next number.

SETUP (run once):
    python dialer.py --register

USAGE:
    Triggered automatically by the "Start Dialing" button in the app.
    Or manually:
    python dialer.py "dialer://start?numbers=2105551234|2105556789&names=John+Smith|Jane+Doe"

REQUIREMENTS:
    Just Python — no extra installs needed!
"""

import sys
import webbrowser
import urllib.parse
import os
import time

try:
    import pyautogui
    pyautogui.FAILSAFE = False
except ImportError:
    pyautogui = None


def register_protocol():
    """Register dialer:// protocol handler on Windows."""
    try:
        import winreg
    except ImportError:
        print("Windows registry not available.")
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

        print(f'Protocol registered!')
        print(f'Command: {command}')
    except Exception as e:
        print(f'Failed to register: {e}')
        print('Try running as Administrator.')


def dial_numbers(contacts):
    """Dial contacts by opening Google Voice in the default browser."""
    if not contacts:
        print('No contacts to dial.')
        return

    print(f'\nStarting dialer with {len(contacts)} number(s)...')
    for c in contacts:
        print(f'  - {c["name"] or "Unknown"}: {c["phone"]}')

    print('\nMake sure you are logged into Google Voice in your browser.\n')
    input('Press ENTER to start dialing the first number...')

    for i, contact in enumerate(contacts):
        name = contact.get('name') or 'Unknown'
        phone = contact.get('phone', '')

        digits = ''.join(c for c in phone if c.isdigit())
        if len(digits) == 10:
            digits = '1' + digits

        if not digits:
            print(f'\n[{i+1}/{len(contacts)}] Skipping {name} — invalid number: {phone}')
            continue

        print(f'\n[{i+1}/{len(contacts)}] {name}  -->  +{digits}')

        # Open Google Voice new-call URL (opens the dialpad)
        url = f'https://voice.google.com/u/0/calls?a=nc,+{digits}'
        webbrowser.open(url)

        if pyautogui:
            # Wait for the tab to load and the dialpad input to be ready
            time.sleep(3)
            # Type the number into the focused dialpad input
            pyautogui.typewrite(digits, interval=0.08)
            time.sleep(0.3)
            # Press Enter to start the call
            pyautogui.press('enter')
            print(f'  Dialing...')
        else:
            print(f'  pyautogui not installed — type the number manually.')
            print(f'  Run: pip install pyautogui')

        if i < len(contacts) - 1:
            input(f'  Press ENTER when done to dial next number...')
        else:
            input(f'  Press ENTER when done (last number)...')

    print('\n\nAll numbers called!')
    input('Press Enter to close...')


def parse_url(url):
    """Parse dialer:// URL and extract contacts list."""
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
        try:
            dial_numbers(contacts)
        except Exception as e:
            print(f'\nERROR: {e}')
            input('\nPress Enter to exit...')
            sys.exit(1)

    else:
        print(f'Unknown argument: {arg}')
        print('Run with --help for usage.')
        input('Press Enter to exit...')
        sys.exit(1)
