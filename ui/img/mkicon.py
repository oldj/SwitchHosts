# -*- coding: utf-8 -*-

def main():

    icons = []

    for i in range(7):
        fn = "icon_%d.ico" % i
        c = open(fn, "rb").read()
        icons.append(c)

    open("icons.py", "w").write(repr(icons))


if __name__ == "__main__":

    main()


