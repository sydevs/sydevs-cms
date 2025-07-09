import type { CollectionConfig } from 'payload'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
  },
  auth: {
    verify: {
      generateEmailHTML: ({ req: _req, token, user }) => {
        const verifyURL = `${process.env.NEXT_PUBLIC_SERVER_URL}/verify-email?token=${token}`
        return `
          <!doctype html>
          <html>
            <head>
              <meta charset="utf-8">
              <title>Verify your email - SY Developers</title>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #f4f4f4; padding: 20px; text-align: center; }
                .content { padding: 20px; }
                .button { display: inline-block; padding: 10px 20px; background: #007cba; color: white; text-decoration: none; border-radius: 4px; }
                .footer { text-align: center; padding: 20px; font-size: 14px; color: #666; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>SY Developers</h1>
                </div>
                <div class="content">
                  <h2>Verify your email address</h2>
                  <p>Hello ${user.email},</p>
                  <p>Thank you for signing up! Please click the button below to verify your email address:</p>
                  <p style="text-align: center;">
                    <a href="${verifyURL}" class="button">Verify Email</a>
                  </p>
                  <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
                  <p><a href="${verifyURL}">${verifyURL}</a></p>
                  <p>This link will expire in 24 hours.</p>
                </div>
                <div class="footer">
                  <p>&copy; 2025 SY Developers. All rights reserved.</p>
                </div>
              </div>
            </body>
          </html>
        `
      },
      generateEmailSubject: ({ req: _req, user: _user }) => {
        return `Verify your email - SY Developers`
      },
    },
    forgotPassword: {
      generateEmailHTML: (args) => {
        const { req: _req, token, user } = args || {}
        if (!token || !user) return ''
        const resetURL = `${process.env.NEXT_PUBLIC_SERVER_URL}/reset-password?token=${token}`
        return `
          <!doctype html>
          <html>
            <head>
              <meta charset="utf-8">
              <title>Reset your password - SY Developers</title>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #f4f4f4; padding: 20px; text-align: center; }
                .content { padding: 20px; }
                .button { display: inline-block; padding: 10px 20px; background: #dc3545; color: white; text-decoration: none; border-radius: 4px; }
                .footer { text-align: center; padding: 20px; font-size: 14px; color: #666; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>SY Developers</h1>
                </div>
                <div class="content">
                  <h2>Reset your password</h2>
                  <p>Hello ${user.email},</p>
                  <p>We received a request to reset your password. Click the button below to set a new password:</p>
                  <p style="text-align: center;">
                    <a href="${resetURL}" class="button">Reset Password</a>
                  </p>
                  <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
                  <p><a href="${resetURL}">${resetURL}</a></p>
                  <p>This link will expire in 1 hour.</p>
                  <p>If you didn't request this password reset, please ignore this email.</p>
                </div>
                <div class="footer">
                  <p>&copy; 2025 SY Developers. All rights reserved.</p>
                </div>
              </div>
            </body>
          </html>
        `
      },
      generateEmailSubject: (args) => {
        const { req: _req, user: _user } = args || {}
        return `Reset your password - SY Developers`
      },
    },
  },
  fields: [
    // Email added by default
    // Add more fields as needed
  ],
}
