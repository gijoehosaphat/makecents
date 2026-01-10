import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const body = await req.text() // GraphQL often sends raw JSON

  const upstreamResponse = await fetch('http://localhost:3002/api/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body,
  })

  const data = await upstreamResponse.text()

  return new NextResponse(data, {
    status: upstreamResponse.status,
    headers: upstreamResponse.headers,
  })
}
