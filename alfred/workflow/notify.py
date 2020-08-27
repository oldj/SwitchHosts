#!/usr/bin/env python
# encoding: utf-8
#
# Copyright (c) 2015 deanishe@deanishe.net
#
# MIT Licence. See http://opensource.org/licenses/MIT
#
# Created on 2015-11-26
#

# TODO: Exclude this module from test and code coverage in py2.6

"""
Post notifications via the macOS Notification Center.

This feature is only available on Mountain Lion (10.8) and later.
It will silently fail on older systems.

The main API is a single function, :func:`~workflow.notify.notify`.

It works by copying a simple application to your workflow's data
directory. It replaces the application's icon with your workflow's
icon and then calls the application to post notifications.
"""

from __future__ import print_function, unicode_literals

import os
import plistlib
import shutil
import subprocess
import sys
import tarfile
import tempfile
import uuid

import workflow


_wf = None
_log = None


#: Available system sounds from System Preferences > Sound > Sound Effects
SOUNDS = (
    'Basso',
    'Blow',
    'Bottle',
    'Frog',
    'Funk',
    'Glass',
    'Hero',
    'Morse',
    'Ping',
    'Pop',
    'Purr',
    'Sosumi',
    'Submarine',
    'Tink',
)


def wf():
    """Return Workflow object for this module.

    Returns:
        workflow.Workflow: Workflow object for current workflow.
    """
    global _wf
    if _wf is None:
        _wf = workflow.Workflow()
    return _wf


def log():
    """Return logger for this module.

    Returns:
        logging.Logger: Logger for this module.
    """
    global _log
    if _log is None:
        _log = wf().logger
    return _log


def notifier_program():
    """Return path to notifier applet executable.

    Returns:
        unicode: Path to Notify.app ``applet`` executable.
    """
    return wf().datafile('Notify.app/Contents/MacOS/applet')


def notifier_icon_path():
    """Return path to icon file in installed Notify.app.

    Returns:
        unicode: Path to ``applet.icns`` within the app bundle.
    """
    return wf().datafile('Notify.app/Contents/Resources/applet.icns')


def install_notifier():
    """Extract ``Notify.app`` from the workflow to data directory.

    Changes the bundle ID of the installed app and gives it the
    workflow's icon.
    """
    archive = os.path.join(os.path.dirname(__file__), 'Notify.tgz')
    destdir = wf().datadir
    app_path = os.path.join(destdir, 'Notify.app')
    n = notifier_program()
    log().debug('installing Notify.app to %r ...', destdir)
    # z = zipfile.ZipFile(archive, 'r')
    # z.extractall(destdir)
    tgz = tarfile.open(archive, 'r:gz')
    tgz.extractall(destdir)
    if not os.path.exists(n):  # pragma: nocover
        raise RuntimeError('Notify.app could not be installed in ' + destdir)

    # Replace applet icon
    icon = notifier_icon_path()
    workflow_icon = wf().workflowfile('icon.png')
    if os.path.exists(icon):
        os.unlink(icon)

    png_to_icns(workflow_icon, icon)

    # Set file icon
    # PyObjC isn't available for 2.6, so this is 2.7 only. Actually,
    # none of this code will "work" on pre-10.8 systems. Let it run
    # until I figure out a better way of excluding this module
    # from coverage in py2.6.
    if sys.version_info >= (2, 7):  # pragma: no cover
        from AppKit import NSWorkspace, NSImage

        ws = NSWorkspace.sharedWorkspace()
        img = NSImage.alloc().init()
        img.initWithContentsOfFile_(icon)
        ws.setIcon_forFile_options_(img, app_path, 0)

    # Change bundle ID of installed app
    ip_path = os.path.join(app_path, 'Contents/Info.plist')
    bundle_id = '{0}.{1}'.format(wf().bundleid, uuid.uuid4().hex)
    data = plistlib.readPlist(ip_path)
    log().debug('changing bundle ID to %r', bundle_id)
    data['CFBundleIdentifier'] = bundle_id
    plistlib.writePlist(data, ip_path)


def validate_sound(sound):
    """Coerce ``sound`` to valid sound name.

    Returns ``None`` for invalid sounds. Sound names can be found
    in ``System Preferences > Sound > Sound Effects``.

    Args:
        sound (str): Name of system sound.

    Returns:
        str: Proper name of sound or ``None``.
    """
    if not sound:
        return None

    # Case-insensitive comparison of `sound`
    if sound.lower() in [s.lower() for s in SOUNDS]:
        # Title-case is correct for all system sounds as of macOS 10.11
        return sound.title()
    return None


def notify(title='', text='', sound=None):
    """Post notification via Notify.app helper.

    Args:
        title (str, optional): Notification title.
        text (str, optional): Notification body text.
        sound (str, optional): Name of sound to play.

    Raises:
        ValueError: Raised if both ``title`` and ``text`` are empty.

    Returns:
        bool: ``True`` if notification was posted, else ``False``.
    """
    if title == text == '':
        raise ValueError('Empty notification')

    sound = validate_sound(sound) or ''

    n = notifier_program()

    if not os.path.exists(n):
        install_notifier()

    env = os.environ.copy()
    enc = 'utf-8'
    env['NOTIFY_TITLE'] = title.encode(enc)
    env['NOTIFY_MESSAGE'] = text.encode(enc)
    env['NOTIFY_SOUND'] = sound.encode(enc)
    cmd = [n]
    retcode = subprocess.call(cmd, env=env)
    if retcode == 0:
        return True

    log().error('Notify.app exited with status {0}.'.format(retcode))
    return False


def convert_image(inpath, outpath, size):
    """Convert an image file using ``sips``.

    Args:
        inpath (str): Path of source file.
        outpath (str): Path to destination file.
        size (int): Width and height of destination image in pixels.

    Raises:
        RuntimeError: Raised if ``sips`` exits with non-zero status.
    """
    cmd = [
        b'sips',
        b'-z', str(size), str(size),
        inpath,
        b'--out', outpath]
    # log().debug(cmd)
    with open(os.devnull, 'w') as pipe:
        retcode = subprocess.call(cmd, stdout=pipe, stderr=subprocess.STDOUT)

    if retcode != 0:
        raise RuntimeError('sips exited with %d' % retcode)


def png_to_icns(png_path, icns_path):
    """Convert PNG file to ICNS using ``iconutil``.

    Create an iconset from the source PNG file. Generate PNG files
    in each size required by macOS, then call ``iconutil`` to turn
    them into a single ICNS file.

    Args:
        png_path (str): Path to source PNG file.
        icns_path (str): Path to destination ICNS file.

    Raises:
        RuntimeError: Raised if ``iconutil`` or ``sips`` fail.
    """
    tempdir = tempfile.mkdtemp(prefix='aw-', dir=wf().datadir)

    try:
        iconset = os.path.join(tempdir, 'Icon.iconset')

        if os.path.exists(iconset):  # pragma: nocover
            raise RuntimeError('iconset already exists: ' + iconset)

        os.makedirs(iconset)

        # Copy source icon to icon set and generate all the other
        # sizes needed
        configs = []
        for i in (16, 32, 128, 256, 512):
            configs.append(('icon_{0}x{0}.png'.format(i), i))
            configs.append((('icon_{0}x{0}@2x.png'.format(i), i * 2)))

        shutil.copy(png_path, os.path.join(iconset, 'icon_256x256.png'))
        shutil.copy(png_path, os.path.join(iconset, 'icon_128x128@2x.png'))

        for name, size in configs:
            outpath = os.path.join(iconset, name)
            if os.path.exists(outpath):
                continue
            convert_image(png_path, outpath, size)

        cmd = [
            b'iconutil',
            b'-c', b'icns',
            b'-o', icns_path,
            iconset]

        retcode = subprocess.call(cmd)
        if retcode != 0:
            raise RuntimeError('iconset exited with %d' % retcode)

        if not os.path.exists(icns_path):  # pragma: nocover
            raise ValueError(
                'generated ICNS file not found: ' + repr(icns_path))
    finally:
        try:
            shutil.rmtree(tempdir)
        except OSError:  # pragma: no cover
            pass


if __name__ == '__main__':  # pragma: nocover
    # Simple command-line script to test module with
    # This won't work on 2.6, as `argparse` isn't available
    # by default.
    import argparse

    from unicodedata import normalize

    def ustr(s):
        """Coerce `s` to normalised Unicode."""
        return normalize('NFD', s.decode('utf-8'))

    p = argparse.ArgumentParser()
    p.add_argument('-p', '--png', help="PNG image to convert to ICNS.")
    p.add_argument('-l', '--list-sounds', help="Show available sounds.",
                   action='store_true')
    p.add_argument('-t', '--title',
                   help="Notification title.", type=ustr,
                   default='')
    p.add_argument('-s', '--sound', type=ustr,
                   help="Optional notification sound.", default='')
    p.add_argument('text', type=ustr,
                   help="Notification body text.", default='', nargs='?')
    o = p.parse_args()

    # List available sounds
    if o.list_sounds:
        for sound in SOUNDS:
            print(sound)
        sys.exit(0)

    # Convert PNG to ICNS
    if o.png:
        icns = os.path.join(
            os.path.dirname(o.png),
            os.path.splitext(os.path.basename(o.png))[0] + '.icns')

        print('converting {0!r} to {1!r} ...'.format(o.png, icns),
              file=sys.stderr)

        if os.path.exists(icns):
            raise ValueError('destination file already exists: ' + icns)

        png_to_icns(o.png, icns)
        sys.exit(0)

    # Post notification
    if o.title == o.text == '':
        print('ERROR: empty notification.', file=sys.stderr)
        sys.exit(1)
    else:
        notify(o.title, o.text, o.sound)
