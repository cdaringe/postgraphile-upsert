# tsc && DEBUG="graphile-build-pg:sql,graphile-build:warn" ava build/__tests__/main.test.js

release:
	npm run build
	semantic-release --no-ci