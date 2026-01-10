import dotenv from 'dotenv'
import express from 'express'

// Auth
import { authMiddleware, authErrors, authJwt } from './middleware/authMiddleware'

// Postgraphile
import { postgraphileMiddleware } from './middleware/postgraphileMiddleware'

dotenv.config()
const app = express()
app.use(postgraphileMiddleware())
app.use(express.json())

app.use('/graphql', authJwt)
app.use('/graphql', authMiddleware)
app.use('/graphql', authErrors)

app.listen(process.env.API_PORT || 3000)
