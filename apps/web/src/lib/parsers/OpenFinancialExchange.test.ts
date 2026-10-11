import { describe, expect, it } from 'vitest'
import { parseFile } from './OpenFinancialExchange'

const header = 'OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\n\n'

// Most banks export SGML, where leaf tags are never closed.
const sgml = `${header}<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<CURDEF>CAD
<BANKACCTFROM>
<BANKID>0001
<ACCTID>12345678
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20240101
<DTEND>20240131
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20240115
<TRNAMT>-4.50
<FITID>abc1
<NAME>Coffee Shop
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>995.50
<DTASOF>20240131
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`

describe('parseFile', () => {
  it('reads the header attributes', async () => {
    const parsed = await parseFile(sgml)
    expect(parsed.header.VERSION).toBe('102')
    expect(parsed.header.DATA).toBe('OFXSGML')
  })

  it('parses SGML leaf tags that are never closed', async () => {
    const parsed = await parseFile(sgml)
    // xml2js collapses single-element lists, which the declared types don't reflect.
    const statement = (parsed.OFX.BANKMSGSRSV1 as unknown as { STMTTRNRS: { STMTRS: any } }).STMTTRNRS.STMTRS
    expect(statement?.BANKACCTFROM.ACCTID).toBe('12345678')
    expect(statement?.LEDGERBAL.BALAMT).toBe('995.50')
    const transaction = statement?.BANKTRANLIST.STMTTRN
    expect(transaction).toMatchObject({ TRNAMT: '-4.50', FITID: 'abc1', NAME: 'Coffee Shop' })
  })

  it('parses well-formed XML too', async () => {
    const xml = `${header}<OFX><SIGNONMSGSRSV1><SONRS><STATUS><CODE>0</CODE></STATUS></SONRS></SIGNONMSGSRSV1></OFX>`
    const parsed = await parseFile(xml)
    expect(parsed.OFX.SIGNONMSGSRSV1?.SONRS?.STATUS.CODE).toBe('0')
  })
})
