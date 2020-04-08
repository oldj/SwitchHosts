#!/usr/bin/env bash

# this script will be run at folder `../`
# the working dir will be `../`

lessc --js --clean-css app-ui/styles/themes/light/index.less app/ui/theme-light.css
lessc --js --clean-css app-ui/styles/themes/dark/index.less app/ui/theme-dark.css

echo 'lessc done!'
