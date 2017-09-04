#!/usr/bin/env bash

# this script will be run at folder `../`
# the working dir will be `../`

source=$(pwd)/app-ui/styles/iconfont
target=$(pwd)/node_modules/antd/lib/style/core/iconfont

rm -f ${target} && ln -s ${source} ${target}
