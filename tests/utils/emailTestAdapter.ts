import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'
import type { Address } from 'nodemailer/lib/mailer'

export interface CapturedEmail {
  to: string | string[]
  from: string
  subject: string
  html?: string
  text?: string
  sentAt: Date
}

export class EmailTestAdapter {
  private transporter: Transporter
  private capturedEmails: CapturedEmail[] = []
  public account: {
    user: string
    pass: string
    web: string
  }
  
  // Create function that returns email adapter configuration
  static create(adapter?: EmailTestAdapter): (args: any) => any {
    const instance = adapter || new EmailTestAdapter()
    return () => ({
      defaultFromAddress: 'test@ethereal.email',
      defaultFromName: 'Test Email Adapter',
      name: 'ethereal',
      sendEmail: instance.sendEmail.bind(instance),
      adapter: instance // Keep reference to adapter for testing
    })
  }

  constructor() {
    // Initialize with empty transporter - will be set up in init
    this.transporter = null as any
    this.account = {
      user: '',
      pass: '',
      web: '',
    }
  }

  async init(): Promise<void> {
    // Create Ethereal test account
    const testAccount = await nodemailer.createTestAccount()
    
    this.account = {
      user: testAccount.user,
      pass: testAccount.pass,
      web: 'https://ethereal.email',
    }

    // Create transporter with Ethereal credentials
    this.transporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    })
    
    console.log('Email adapter initialized with Ethereal account:', {
      user: this.account.user,
      host: testAccount.smtp.host,
    })
  }

  async sendEmail(options: { to?: string | Address | (string | Address)[]; from?: string | Address; subject?: string; html?: string | Buffer; text?: string | Buffer; }): Promise<any> {
    const { to, from, subject, html, text } = options

    try {
      // Send email through Ethereal first
      const info = await this.transporter.sendMail({
        from,
        to: Array.isArray(to) ? to.join(', ') : to,
        subject,
        html,
        text,
      })

      // Capture email for testing after successful send
      const capturedTo = Array.isArray(to) 
        ? to.map(t => typeof t === 'string' ? t : t.address || '').join(', ')
        : typeof to === 'string' ? to : to?.address || ''
      
      const capturedFrom = typeof from === 'string' ? from : from?.address || ''
      
      this.capturedEmails.push({
        to: capturedTo,
        from: capturedFrom,
        subject: subject || '',
        html: typeof html === 'string' ? html : undefined,
        text: typeof text === 'string' ? text : undefined,
        sentAt: new Date(),
      })

      // Log preview URL
      console.log('Preview URL:', nodemailer.getTestMessageUrl(info))
      console.log('Email captured:', { to, subject })
      
      return info
    } catch (error) {
      console.error('Error sending email:', error)
      throw error
    }
  }

  getCapturedEmails(): CapturedEmail[] {
    return this.capturedEmails
  }

  clearCapturedEmails(): void {
    this.capturedEmails = []
  }

  getLatestEmail(): CapturedEmail | undefined {
    return this.capturedEmails[this.capturedEmails.length - 1]
  }

  findEmailByTo(recipient: string): CapturedEmail | undefined {
    return this.capturedEmails.find(email => {
      const recipients = Array.isArray(email.to) ? email.to : [email.to]
      return recipients.includes(recipient)
    })
  }

  async waitForEmail(timeout: number = 5000): Promise<CapturedEmail> {
    const startTime = Date.now()
    const initialCount = this.capturedEmails.length
    
    console.log(`Waiting for email... Initial count: ${initialCount}`)
    
    while (Date.now() - startTime < timeout) {
      if (this.capturedEmails.length > initialCount) {
        console.log(`Email captured! New count: ${this.capturedEmails.length}`)
        return this.capturedEmails[this.capturedEmails.length - 1]
      }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    console.log(`Timeout! Final count: ${this.capturedEmails.length}`)
    console.log('All captured emails:', this.capturedEmails)
    throw new Error(`No email captured within ${timeout}ms. Current count: ${this.capturedEmails.length}`)
  }
}