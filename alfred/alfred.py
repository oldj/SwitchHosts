# -*- coding: utf-8 -*-

import sys
# the workflow package below can be downloaded from:
# https://github.com/deanishe/alfred-workflow/releases
from workflow import Workflow, ICON_WEB, web


def get_subtitle(item):
    content = item.get('content', '')
    return content.partition('\n')[0].strip()


def main(wf):
    url = 'http://127.0.0.1:50761/api/list'
    r = web.get(url)

    # throw an error if request failed
    # Workflow will catch this and show it to the user
    r.raise_for_status()

    # Parse the JSON returned by pinboard and extract the posts
    result = r.json()
    items = result['data']

    # Loop through the returned posts and add an item for each to
    # the list of results for Alfred
    for item in items:
        on = item.get('on', False)
        wf.add_item(
            title=item.get('title', 'untitled'),
            subtitle=get_subtitle(item),
            arg=item.get('id'),
            valid=True,
            icon='on.png' if on else 'off.png',
        )

    # Send the results to Alfred as XML
    wf.send_feedback()


if __name__ == '__main__':
    my_wf = Workflow()
    sys.exit(my_wf.run(main))
