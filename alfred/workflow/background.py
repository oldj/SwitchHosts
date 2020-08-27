#!/usr/bin/env python
# encoding: utf-8
#
# Copyright (c) 2014 deanishe@deanishe.net
#
# MIT Licence. See http://opensource.org/licenses/MIT
#
# Created on 2014-04-06
#

"""This module provides an API to run commands in background processes.

Combine with the :ref:`caching API <caching-data>` to work from cached data
while you fetch fresh data in the background.

See :ref:`the User Manual <background-processes>` for more information
and examples.
"""

from __future__ import print_function, unicode_literals

import signal
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


def _log():
    return wf().logger


def _arg_cache(name):
    """Return path to pickle cache file for arguments.

    :param name: name of task
    :type name: ``unicode``
    :returns: Path to cache file
    :rtype: ``unicode`` filepath

    """
    return wf().cachefile(name + '.argcache')


def _pid_file(name):
    """Return path to PID file for ``name``.

    :param name: name of task
    :type name: ``unicode``
    :returns: Path to PID file for task
    :rtype: ``unicode`` filepath

    """
    return wf().cachefile(name + '.pid')


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


def _job_pid(name):
    """Get PID of job or `None` if job does not exist.

    Args:
        name (str): Name of job.

    Returns:
        int: PID of job process (or `None` if job doesn't exist).
    """
    pidfile = _pid_file(name)
    if not os.path.exists(pidfile):
        return

    with open(pidfile, 'rb') as fp:
        pid = int(fp.read())

        if _process_exists(pid):
            return pid

    os.unlink(pidfile)


def is_running(name):
    """Test whether task ``name`` is currently running.

    :param name: name of task
    :type name: unicode
    :returns: ``True`` if task with name ``name`` is running, else ``False``
    :rtype: bool

    """
    if _job_pid(name) is not None:
        return True

    return False


def _background(pidfile, stdin='/dev/null', stdout='/dev/null',
                stderr='/dev/null'):  # pragma: no cover
    """Fork the current process into a background daemon.

    :param pidfile: file to write PID of daemon process to.
    :type pidfile: filepath
    :param stdin: where to read input
    :type stdin: filepath
    :param stdout: where to write stdout output
    :type stdout: filepath
    :param stderr: where to write stderr output
    :type stderr: filepath

    """
    def _fork_and_exit_parent(errmsg, wait=False, write=False):
        try:
            pid = os.fork()
            if pid > 0:
                if write:  # write PID of child process to `pidfile`
                    tmp = pidfile + '.tmp'
                    with open(tmp, 'wb') as fp:
                        fp.write(str(pid))
                    os.rename(tmp, pidfile)
                if wait:  # wait for child process to exit
                    os.waitpid(pid, 0)
                os._exit(0)
        except OSError as err:
            _log().critical('%s: (%d) %s', errmsg, err.errno, err.strerror)
            raise err

    # Do first fork and wait for second fork to finish.
    _fork_and_exit_parent('fork #1 failed', wait=True)

    # Decouple from parent environment.
    os.chdir(wf().workflowdir)
    os.setsid()

    # Do second fork and write PID to pidfile.
    _fork_and_exit_parent('fork #2 failed', write=True)

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


def kill(name, sig=signal.SIGTERM):
    """Send a signal to job ``name`` via :func:`os.kill`.

    .. versionadded:: 1.29

    Args:
        name (str): Name of the job
        sig (int, optional): Signal to send (default: SIGTERM)

    Returns:
        bool: `False` if job isn't running, `True` if signal was sent.
    """
    pid = _job_pid(name)
    if pid is None:
        return False

    os.kill(pid, sig)
    return True


def run_in_background(name, args, **kwargs):
    r"""Cache arguments then call this script again via :func:`subprocess.call`.

    :param name: name of job
    :type name: unicode
    :param args: arguments passed as first argument to :func:`subprocess.call`
    :param \**kwargs: keyword arguments to :func:`subprocess.call`
    :returns: exit code of sub-process
    :rtype: int

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
        _log().info('[%s] job already running', name)
        return

    argcache = _arg_cache(name)

    # Cache arguments
    with open(argcache, 'wb') as fp:
        pickle.dump({'args': args, 'kwargs': kwargs}, fp)
        _log().debug('[%s] command cached: %s', name, argcache)

    # Call this script
    cmd = ['/usr/bin/python', __file__, name]
    _log().debug('[%s] passing job to background runner: %r', name, cmd)
    retcode = subprocess.call(cmd)

    if retcode:  # pragma: no cover
        _log().error('[%s] background runner failed with %d', name, retcode)
    else:
        _log().debug('[%s] background job started', name)

    return retcode


def main(wf):  # pragma: no cover
    """Run command in a background process.

    Load cached arguments, fork into background, then call
    :meth:`subprocess.call` with cached arguments.

    """
    log = wf.logger
    name = wf.args[0]
    argcache = _arg_cache(name)
    if not os.path.exists(argcache):
        msg = '[{0}] command cache not found: {1}'.format(name, argcache)
        log.critical(msg)
        raise IOError(msg)

    # Fork to background and run command
    pidfile = _pid_file(name)
    _background(pidfile)

    # Load cached arguments
    with open(argcache, 'rb') as fp:
        data = pickle.load(fp)

    # Cached arguments
    args = data['args']
    kwargs = data['kwargs']

    # Delete argument cache file
    os.unlink(argcache)

    try:
        # Run the command
        log.debug('[%s] running command: %r', name, args)

        retcode = subprocess.call(args, **kwargs)

        if retcode:
            log.error('[%s] command failed with status %d', name, retcode)
    finally:
        os.unlink(pidfile)

    log.debug('[%s] job complete', name)


if __name__ == '__main__':  # pragma: no cover
    wf().run(main)
