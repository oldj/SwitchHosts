# encoding: utf-8
#
# Copyright (c) 2016 Dean Jackson <deanishe@deanishe.net>
#
# MIT Licence. See http://opensource.org/licenses/MIT
#
# Created on 2016-06-25
#

"""
:class:`Workflow3` supports Alfred 3's new features.

It is an Alfred 3-only version of :class:`~workflow.workflow.Workflow`.

It supports setting :ref:`workflow-variables` and
:class:`the more advanced modifiers <Modifier>` supported by Alfred 3.

In order for the feedback mechanism to work correctly, it's important
to create :class:`Item3` and :class:`Modifier` objects via the
:meth:`Workflow3.add_item()` and :meth:`Item3.add_modifier()` methods
respectively. If you instantiate :class:`Item3` or :class:`Modifier`
objects directly, the current :class:`~workflow.workflow3.Workflow3`
object won't be aware of them, and they won't be sent to Alfred when
you call :meth:`~workflow.workflow3.Workflow3.send_feedback()`.
"""

from __future__ import print_function, unicode_literals, absolute_import

import json
import os
import sys

from .workflow import Workflow


class Modifier(object):
    """Modify ``Item3`` values for when specified modifier keys are pressed.

    Valid modifiers (i.e. values for ``key``) are:

     * cmd
     * alt
     * shift
     * ctrl
     * fn

    Attributes:
        arg (unicode): Arg to pass to following action.
        key (unicode): Modifier key (see above).
        subtitle (unicode): Override item subtitle.
        valid (bool): Override item validity.
        variables (dict): Workflow variables set by this modifier.
    """

    def __init__(self, key, subtitle=None, arg=None, valid=None):
        """Create a new :class:`Modifier`.

        You probably don't want to use this class directly, but rather
        use :meth:`Item3.add_modifier()` to add modifiers to results.

        Args:
            key (unicode): Modifier key, e.g. ``"cmd"``, ``"alt"`` etc.
            subtitle (unicode, optional): Override default subtitle.
            arg (unicode, optional): Argument to pass for this modifier.
            valid (bool, optional): Override item's validity.
        """
        self.key = key
        self.subtitle = subtitle
        self.arg = arg
        self.valid = valid

        self.config = {}
        self.variables = {}

    def setvar(self, name, value):
        """Set a workflow variable for this Item.

        Args:
            name (unicode): Name of variable.
            value (unicode): Value of variable.
        """
        self.variables[name] = value

    def getvar(self, name, default=None):
        """Return value of workflow variable for ``name`` or ``default``.

        Args:
            name (unicode): Variable name.
            default (None, optional): Value to return if variable is unset.

        Returns:
            unicode or ``default``: Value of variable if set or ``default``.
        """
        return self.variables.get(name, default)

    @property
    def obj(self):
        """Modifier formatted for JSON serialization for Alfred 3.

        Returns:
            dict: Modifier for serializing to JSON.
        """
        o = {}

        if self.subtitle is not None:
            o['subtitle'] = self.subtitle

        if self.arg is not None:
            o['arg'] = self.arg

        if self.valid is not None:
            o['valid'] = self.valid

        # Variables and config
        if self.variables or self.config:
            d = {}
            if self.variables:
                d['variables'] = self.variables

            if self.config:
                d['config'] = self.config

            if self.arg is not None:
                d['arg'] = self.arg

            o['arg'] = json.dumps({'alfredworkflow': d})

        return o


class Item3(object):
    """Represents a feedback item for Alfred 3.

    Generates Alfred-compliant JSON for a single item.

    You probably shouldn't use this class directly, but via
    :meth:`Workflow3.add_item`. See :meth:`~Workflow3.add_item`
    for details of arguments.
    """

    def __init__(self, title, subtitle='', arg=None, autocomplete=None,
                 valid=False, uid=None, icon=None, icontype=None,
                 type=None, largetext=None, copytext=None, quicklookurl=None):
        """Use same arguments as for :meth:`Workflow.add_item`.

        Argument ``subtitle_modifiers`` is not supported.
        """
        self.title = title
        self.subtitle = subtitle
        self.arg = arg
        self.autocomplete = autocomplete
        self.valid = valid
        self.uid = uid
        self.icon = icon
        self.icontype = icontype
        self.type = type
        self.quicklookurl = quicklookurl
        self.largetext = largetext
        self.copytext = copytext

        self.modifiers = {}

        self.config = {}
        self.variables = {}

    def setvar(self, name, value):
        """Set a workflow variable for this Item.

        Args:
            name (unicode): Name of variable.
            value (unicode): Value of variable.

        """
        self.variables[name] = value

    def getvar(self, name, default=None):
        """Return value of workflow variable for ``name`` or ``default``.

        Args:
            name (unicode): Variable name.
            default (None, optional): Value to return if variable is unset.

        Returns:
            unicode or ``default``: Value of variable if set or ``default``.
        """
        return self.variables.get(name, default)

    def add_modifier(self, key, subtitle=None, arg=None, valid=None):
        """Add alternative values for a modifier key.

        Args:
            key (unicode): Modifier key, e.g. ``"cmd"`` or ``"alt"``
            subtitle (unicode, optional): Override item subtitle.
            arg (unicode, optional): Input for following action.
            valid (bool, optional): Override item validity.

        Returns:
            Modifier: Configured :class:`Modifier`.
        """
        mod = Modifier(key, subtitle, arg, valid)

        for k in self.variables:
            mod.setvar(k, self.variables[k])

        self.modifiers[key] = mod

        return mod

    @property
    def obj(self):
        """Item formatted for JSON serialization.

        Returns:
            dict: Data suitable for Alfred 3 feedback.
        """
        # Basic values
        o = {'title': self.title,
             'subtitle': self.subtitle,
             'valid': self.valid}

        icon = {}

        # Optional values
        if self.arg is not None:
            o['arg'] = self.arg

        if self.autocomplete is not None:
            o['autocomplete'] = self.autocomplete

        if self.uid is not None:
            o['uid'] = self.uid

        if self.type is not None:
            o['type'] = self.type

        if self.quicklookurl is not None:
            o['quicklookurl'] = self.quicklookurl

        # Largetype and copytext
        text = self._text()
        if text:
            o['text'] = text

        icon = self._icon()
        if icon:
            o['icon'] = icon

        # Variables and config
        js = self._vars_and_config()
        if js:
            o['arg'] = js

        # Modifiers
        mods = self._modifiers()
        if mods:
            o['mods'] = mods

        return o

    def _icon(self):
        """Return `icon` object for item.

        Returns:
            dict: Mapping for item `icon` (may be empty).
        """
        icon = {}
        if self.icon is not None:
            icon['path'] = self.icon

        if self.icontype is not None:
            icon['type'] = self.icontype

        return icon

    def _text(self):
        """Return `largetext` and `copytext` object for item.

        Returns:
            dict: `text` mapping (may be empty)
        """
        text = {}
        if self.largetext is not None:
            text['largetype'] = self.largetext

        if self.copytext is not None:
            text['copy'] = self.copytext

        return text

    def _vars_and_config(self):
        """Build `arg` including workflow variables and configuration.

        Returns:
            str: JSON string value for `arg` (or `None`)
        """
        if self.variables or self.config:
            d = {}
            if self.variables:
                d['variables'] = self.variables

            if self.config:
                d['config'] = self.config

            if self.arg is not None:
                d['arg'] = self.arg

            return json.dumps({'alfredworkflow': d})

        return None

    def _modifiers(self):
        """Build `mods` dictionary for JSON feedback.

        Returns:
            dict: Modifier mapping or `None`.
        """
        if self.modifiers:
            mods = {}
            for k, mod in self.modifiers.items():
                mods[k] = mod.obj

            return mods

        return None


class Workflow3(Workflow):
    """Workflow class that generates Alfred 3 feedback.

    Attributes:
        item_class (class): Class used to generate feedback items.
        variables (dict): Top level workflow variables.
    """

    item_class = Item3

    def __init__(self, **kwargs):
        """Create a new :class:`Workflow3` object.

        See :class:`~workflow.workflow.Workflow` for documentation.
        """
        Workflow.__init__(self, **kwargs)
        self.variables = {}
        self._rerun = 0
        self._session_id = None

    @property
    def _default_cachedir(self):
        """Alfred 3's default cache directory."""
        return os.path.join(
            os.path.expanduser(
                '~/Library/Caches/com.runningwithcrayons.Alfred-3/'
                'Workflow Data/'),
            self.bundleid)

    @property
    def _default_datadir(self):
        """Alfred 3's default data directory."""
        return os.path.join(os.path.expanduser(
            '~/Library/Application Support/Alfred 3/Workflow Data/'),
            self.bundleid)

    @property
    def rerun(self):
        """How often (in seconds) Alfred should re-run the Script Filter."""
        return self._rerun

    @rerun.setter
    def rerun(self, seconds):
        """Interval at which Alfred should re-run the Script Filter.

        Args:
            seconds (int): Interval between runs.
        """
        self._rerun = seconds

    @property
    def session_id(self):
        """A unique session ID every time the user uses the workflow.

        .. versionadded:: 1.25

        The session ID persists while the user is using this workflow.
        It expires when the user runs a different workflow or closes
        Alfred.

        """
        if not self._session_id:
            sid = os.getenv('_WF_SESSION_ID')
            if not sid:
                from uuid import uuid4
                sid = uuid4().hex
                self.setvar('_WF_SESSION_ID', sid)

            self._session_id = sid

        return self._session_id

    def setvar(self, name, value):
        """Set a "global" workflow variable.

        These variables are always passed to downstream workflow objects.

        If you have set :attr:`rerun`, these variables are also passed
        back to the script when Alfred runs it again.

        Args:
            name (unicode): Name of variable.
            value (unicode): Value of variable.
        """
        self.variables[name] = value

    def getvar(self, name, default=None):
        """Return value of workflow variable for ``name`` or ``default``.

        Args:
            name (unicode): Variable name.
            default (None, optional): Value to return if variable is unset.

        Returns:
            unicode or ``default``: Value of variable if set or ``default``.
        """
        return self.variables.get(name, default)

    def add_item(self, title, subtitle='', arg=None, autocomplete=None,
                 valid=False, uid=None, icon=None, icontype=None,
                 type=None, largetext=None, copytext=None, quicklookurl=None):
        """Add an item to be output to Alfred.

        See :meth:`~workflow.workflow.Workflow.add_item` for the main
        documentation.

        The key difference is that this method does not support the
        ``modifier_subtitles`` argument. Use the :meth:`~Item3.add_modifier()`
        method instead on the returned item instead.

        Returns:
            Item3: Alfred feedback item.
        """
        item = self.item_class(title, subtitle, arg,
                               autocomplete, valid, uid, icon, icontype, type,
                               largetext, copytext, quicklookurl)

        self._items.append(item)
        return item

    def _mk_session_name(self, name):
        """New cache name/key based on session ID."""
        return '_wfsess-{0}-{1}'.format(self.session_id, name)

    def cache_data(self, name, data, session=False):
        """Cache API with session-scoped expiry.

        .. versionadded:: 1.25

        Args:
            name (str): Cache key
            data (object): Data to cache
            session (bool, optional): Whether to scope the cache
                to the current session.

        ``name`` and ``data`` are as for the
        :meth:`~workflow.workflow.Workflow.cache_data` on
        :class:`~workflow.workflow.Workflow`.

        If ``session`` is ``True``, the ``name`` variable is prefixed
        with :attr:`session_id`.

        """
        if session:
            name = self._mk_session_name(name)

        return super(Workflow3, self).cache_data(name, data)

    def cached_data(self, name, data_func=None, max_age=60, session=False):
        """Cache API with session-scoped expiry.

        .. versionadded:: 1.25

        Args:
            name (str): Cache key
            data_func (callable): Callable that returns fresh data. It
                is called if the cache has expired or doesn't exist.
            max_age (int): Maximum allowable age of cache in seconds.
            session (bool, optional): Whether to scope the cache
                to the current session.

        ``name``, ``data_func`` and ``max_age`` are as for the
        :meth:`~workflow.workflow.Workflow.cached_data` on
        :class:`~workflow.workflow.Workflow`.

        If ``session`` is ``True``, the ``name`` variable is prefixed
        with :attr:`session_id`.

        """
        if session:
            name = self._mk_session_name(name)

        return super(Workflow3, self).cached_data(name, data_func, max_age)

    def clear_session_cache(self):
        """Remove *all* session data from the cache.

        .. versionadded:: 1.25
        """
        def _is_session_file(filename):
            return filename.startswith('_wfsess-')

        self.clear_cache(_is_session_file)

    @property
    def obj(self):
        """Feedback formatted for JSON serialization.

        Returns:
            dict: Data suitable for Alfred 3 feedback.
        """
        items = []
        for item in self._items:
            items.append(item.obj)

        o = {'items': items}
        if self.variables:
            o['variables'] = self.variables
        if self.rerun:
            o['rerun'] = self.rerun
        return o

    def send_feedback(self):
        """Print stored items to console/Alfred as JSON."""
        json.dump(self.obj, sys.stdout)
        sys.stdout.flush()
