import { IncomingMessage } from 'http'
import { Request } from 'express'

/*
auth: {
  role: 'authenticated_users',
  exp: 1660227229,
  id: 1,
  email: 'joeleonard@gmail.com',
  iat: 1659622429,
  aud: 'postgraphile',
  iss: 'postgraphile'
}
*/
interface JwtPayload {
  role: string
  exp: number
  id: number
  email: string
  iat: number
  aud: string
  iss: string
}

interface ExtendedIncomingMessage extends IncomingMessage {
  auth?: JwtPayload
}

interface ExtendedRequest extends Request {
  auth?: JwtPayload
}
