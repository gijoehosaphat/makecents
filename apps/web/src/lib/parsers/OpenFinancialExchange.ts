import { Parser } from 'xml2js'

export interface StatementTransaction {
  TRNTYPE: string
  DTPOSTED: string
  TRNAMT: string
  FITID: string
  NAME: string
  MEMO: string
}

export interface BankTransactionList {
  DTSTART: string
  DTEND: string
  STMTTRN: StatementTransaction[]
}

export interface BankAccount {
  TRNUID: string
  STATUS: Status
  STMTRS: BankAccountDownloadResponseAggregate
}

export interface BankAccountDownloadResponseAggregate {
  CURDEF: string
  BANKACCTFROM: BankAccountFromAggregate
  BANKTRANLIST: BankTransactionList
  LEDGERBAL: Balance
  AVAILBAL: Balance
}

export interface BankAccountFromAggregate {
  BANKID: string
  ACCTID: string
  ACCTTYPE: string
}

export interface CreditCardAccount {
  TRNUID: string
  STATUS: Status
  CCSTMTRS: CreditCardDownloadResponseAggregate
}

export interface CreditCardDownloadResponseAggregate {
  CURDEF: string
  CCACCTFROM: CreditCardAccountFromAggregate
  BANKTRANLIST: BankTransactionList
  LEDGERBAL: Balance
  AVAILBAL: Balance
}

export interface CreditCardAccountFromAggregate {
  ACCTID: string
}

export interface Balance {
  BALAMT: string
  DTASOF: string
}

export interface Status {
  CODE: string
  SEVERITY: string
  MESSAGE: string
}

export interface OpenFinancialExchangeFormatHeader {
  OFXHEADER?: string
  DATA?: string
  VERSION?: string
  SECURITY?: string
  ENCODING?: string
  CHARSET?: string
  COMPRESSION?: string
  OLDFILEUID?: string
  NEWFILEUID?: string
  [key: string]: string | undefined
}

export interface OpenFinancialExchangeFormatBody {
  SIGNONMSGSRSV1: {
    SONRS: {
      STATUS: Status
      DTSERVER: string
      LANGUAGE: string
      INTUBID: string
    }
  }
  CREDITCARDMSGSRSV1: {
    CCSTMTTRNRS: CreditCardAccount[]
  }
  BANKMSGSRSV1: {
    STMTTRNRS: BankAccount[]
  }
}

export interface OpenFinancialExchangeFormat {
  OFX: OpenFinancialExchangeFormatBody
  header: OpenFinancialExchangeFormatHeader
}

function sgml2Xml(sgml: string) {
  return sgml
    .replace(/>\s+</g, '><') // remove whitespace inbetween tag close/open
    .replace(/\s+</g, '<') // remove whitespace before a close tag
    .replace(/>\s+/g, '>') // remove whitespace after a close tag
    .replace(/<([A-Z0-9_]*)+\.+([A-Z0-9_]*)>([^<]+)/g, '<$1$2>$3')
    .replace(/<(\w+?)>([^<]+)/g, '<$1>$2</$1>')
}

/**
 * Given an XML string, parse it and return it as a JSON-friendly Javascript object
 * @param {string} xml The XML to parse
 * @returns {Promise} A promise that will resolve to the parsed XML as a JSON-style object
 */
function parseXml(xml: string): Promise<OpenFinancialExchangeFormat> {
  const xmlParser = new Parser({ explicitArray: false })
  return new Promise((resolve, reject) => {
    xmlParser.parseString(xml, (err: Error | null, result: any) => {
      if (err) {
        reject(err)
      } else {
        resolve(result)
      }
    })
  })
}

/**
 * Given a string of OFX data, parse it.
 * @param {string} data The OFX data to parse
 * @returns {Promise} A promise that will resolve to the parsed data.
 */
export async function parseFile(data: string): Promise<OpenFinancialExchangeFormat> {
  // firstly, split into the header attributes and the footer sgml
  const ofx = data.split('<OFX>', 2)

  // firstly, parse the headers
  const headerString = ofx[0].split(/\r?\n/)
  const header: OpenFinancialExchangeFormatHeader = {}
  headerString.forEach((attrs) => {
    const headAttr = attrs.split(/:/, 2)
    header[headAttr[0]] = headAttr[1]
  })

  // make the SGML and the XML
  const content = '<OFX>' + ofx[1]

  // Parse the XML/SGML portion of the file into an object
  // Try as XML first, and if that fails do the SGML->XML mangling
  // return parseXml(content)
  //   .catch(() => {
  //     // XML parse failed.
  //     // Do the SGML->XML Manging and try again.
  //     return parseXml(sgml2Xml(content))
  //   })
  //   .then((response: any) => {
  //     // Put the headers into the returned data
  //     response.header = header
  //     return response
  //   })
  let response = null
  try {
    response = await parseXml(content)
  } catch (error) {
    response = await parseXml(sgml2Xml(content))
  }
  response.header = header
  return response
}
