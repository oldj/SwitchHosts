#!/usr/bin/env python
# encoding: utf-8
#
# Copyright (c) 2014 deanishe@deanishe.net
#
# MIT Licence. See http://opensource.org/licenses/MIT
#
# Created on 2014-04-06
#

"""Run background tasks."""

from __future__ import print_function, unicode_literals

import sys
import os
import subprocess
import pickle

from workflow import Workflow

__all__ = ['is_running', 'run_in_background']

_wf = None


def wf():
    global _wf
    if _wf is None:
        _wf = Workflow()
    return _wf


def _arg_cache(name):
    """Return path to pickle cache file for arguments.

    :param name: name of task
    :type name: ``unicode``
    :returns: Path to cache file
    :rtype: ``unicode`` filepath

    """
    return wf().cachefile('{0}.argcache'.format(name))


def _pid_file(name):
    """Return path to PID file for ``name``.

    :param name: name of task
    :type name: ``unicode``
    :returns: Path to PID file for task
    :rtype: ``unicode`` filepath

    """
    return wf().cachefile('{0}.pid'.format(name))


def _process_exists(pid):
    """Check if a process with PID ``pid`` exists.

    :param pid: PID to check
    :type pid: ``int``
    :returns: ``True`` if process exists, else ``False``
    :rtype: ``Boolean``

    """
    try:
        os.kill(pid, 0)
    except OSError:  # not running
        return False
    return True


def is_running(name):
    """Test whether task is running under ``name``.

    :param name: name of task
    :type name: ``unicode``
    :returns: ``True`` if task with name ``name`` is running, else ``False``
    :rtype: ``Boolean``

    """
    pidfile = _pid_file(name)
    if not os.path.exists(pidfile):
        return False

    with open(pidfile, 'rb') as file_obj:
        pid = int(file_obj.read().strip())

    if _process_exists(pid):
        return True

    elif os.path.exists(pidfile):
        os.unlink(pidfile)

    return False


def _background(stdin='/dev/null', stdout='/dev/null',
                stderr='/dev/null'):  # pragma: no cover
    """Fork the current process into a background daemon.

    :param stdin: where to read input
    :type stdin: filepath
    :param stdout: where to write stdout output
    :type stdout: filepath
    :param stderr: where to write stderr output
    :type stderr: filepath

    """
    def _fork_and_exit_parent(errmsg):
        try:
            pid = os.fork()
            if pid > 0:
                os._exit(0)
        except OSError as err:
            wf().logger.critical('%s: (%d) %s', errmsg, err.errno,
                                 err.strerror)
            raise err

    # Do first fork.
    _fork_and_exit_parent('fork #1 failed')

    # Decouple from parent environment.
    os.chdir(wf().workflowdir)
    os.setsid()

    # Do second fork.
    _fork_and_exit_parent('fork #2 failed')

    # Now I am a daemon!
    # Redirect standard file descriptors.
    si = open(stdin, 'r', 0)
    so = open(stdout, 'a+', 0)
    se = open(stderr, 'a+', 0)
    if hasattr(sys.stdin, 'fileno'):
        os.dup2(si.fileno(), sys.stdin.fileno())
    if hasattr(sys.stdout, 'fileno'):
        os.dup2(so.fileno(), sys.stdout.fileno())
    if hasattr(sys.stderr, 'fileno'):
        os.dup2(se.fileno(), sys.stderr.fileno())


def run_in_background(name, args, **kwargs):
    r"""Cache arguments then call this script again via :func:`subprocess.call`.

    :param name: name of task
    :type name: ``unicode``
    :param args: arguments passed as first argument to :func:`subprocess.call`
    :param \**kwargs: keyword arguments to :func:`subprocess.call`
    :returns: exit code of sub-process
    :rtype: ``int``

    When you call this function, it caches its arguments and then calls
    ``background.py`` in a subprocess. The Python subprocess will load the
    cached arguments, fork into the background, and then run the command you
    specified.

    This function will return as soon as the ``background.py`` subprocess has
    forked, returning the exit code of *that* process (i.e. not of the command
    you're trying to run).

    If that process fails, an error will be written to the log file.

    If a process is already running under the same name, this function will
    return immediately and will not run the specified command.

    """
    if is_running(name):
        wf().logger.info('Task `{0}` is already running'.format(name))
        return

    argcache = _arg_cache(name)

    # Cache arguments
    with open(argcache, 'wb') as file_obj:
        pickle.dump({'args': args, 'kwargs': kwargs}, file_obj)
        wf().logger.debug('Command arguments cached to `{0}`'.format(argcache))

    # Call this script
    cmd = ['/usr/bin/python', __file__, name]
    wf().logger.debug('Calling {0!r} ...'.format(cmd))
    retcode = subprocess.call(cmd)
    if retcode:  # pragma: no cover
        wf().logger.error('Failed to call task in background')
    else:
        wf().logger.debug('Executing task `{0}` in background...'.format(name))
    return retcode


def main(wf):  # pragma: no cover
    """Run command in a background process.

    Load cached arguments, fork into background, then call
    :meth:`subprocess.call` with cached arguments.

    """
    name = wf.args[0]
    argcache = _arg_cache(name)
    if not os.path.exists(argcache):
        wf.logger.critical('No arg cache found : {0!r}'.format(argcache))
        return 1

    # Load cached arguments
    with open(argcache, 'rb') as file_obj:
        data = pickle.load(file_obj)

    # Cached arguments
    args = data['args']
    kwargs = data['kwargs']

    # Delete argument cache file
    os.unlink(argcache)

    pidfile = _pid_file(name)

    # Fork to background
    _background()

    # Write PID to file
    with open(pidfile, 'wb') as file_obj:
        file_obj.write('{0}'.format(os.getpid()))

    # Run the command
    try:
        wf.logger.debug('Task `{0}` running'.format(name))
        wf.logger.debug('cmd : {0!r}'.format(args))

        retcode = subprocess.call(args, **kwargs)

        if retcode:
            wf.logger.error('Command failed with [{0}] : {1!r}'.format(
                            retcode, args))

    finally:
        if os.path.exists(pidfile):
            os.unlink(pidfile)
        wf.logger.debug('Task `{0}` finished'.format(name))


if __name__ == '__main__':  # pragma: no cover
    wf().run(main)
