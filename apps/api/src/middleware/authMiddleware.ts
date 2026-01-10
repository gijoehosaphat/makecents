import { ErrorRequestHandler, Response, NextFunction } from 'express'
import { expressjwt } from 'express-jwt'
import type { ExtendedRequest } from '../types'
import dotenv from 'dotenv'

dotenv.config()

export function authMiddleware(req: ExtendedRequest, res: Response, next: NextFunction) {
  // if (req.auth) {
  //   //TODO: Inspect the request for even more autorization?
  //   console.log(req.auth)
  // }
  next()
}

export const authErrors: ErrorRequestHandler = (err, req, res, next) => {
  if (err.name === 'UnauthorizedError') {
    console.error(err)
    res.status(err.status).json({ errors: [{ message: err.message }] })
    res.end()
  }
}

export const authJwt = expressjwt({
  secret: process.env.AUTH_SECRET || '',
  algorithms: ['RS256'],
  credentialsRequired: false,
})
