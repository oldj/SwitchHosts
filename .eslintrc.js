module.exports = {
    'env': {
        'browser': true,
        'node': true,
        'commonjs': true,
        'es6': true
    },
    'extends': 'eslint:recommended',
    'globals': {
        'MacGap': true,
        '$': true,
        'console': true,
        'Vue': true
    },
    'rules': {
        'indent': [
            'error',
            4
        ],
        'linebreak-style': [
            'error',
            'unix'
        ],
        'quotes': [
            'error',
            'single'
            // 'backtick'
        ],
        'semi': [
            'error',
            'always'
        ],
        'no-empty': [
            'error',
            {
                'allowEmptyCatch': true
            }
        ]
    }
};
