# -*- coding: utf-8 -*-

import glob

def main():

    icons2 = {}

    for fn in glob.glob("*.png"):
        if fn.startswith("icon_"):
            continue

        c = open(fn, "rb").read()
        icons2[fn.partition(".")[0]] = c

    open("icons.py", "w").write(repr(icons2))


if __name__ == "__main__":

    main()


