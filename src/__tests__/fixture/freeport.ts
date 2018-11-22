import { promisify } from 'util'
const freeportCb = require('freeport')
export const freeport = promisify(freeportCb)
