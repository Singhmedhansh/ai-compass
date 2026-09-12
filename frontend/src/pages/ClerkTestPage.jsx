import { ClerkProvider, SignIn, useUser } from '@clerk/clerk-react'

import SEO from '../components/ui/SEO'

const PUBLISHABLE_KEY = "pk_test_aG9uZXN0LW1vbGx5LTM0LmNsZXJrLmFjY291bnRzLmRldiQ"

function ClerkTestContent() {
  const { isLoaded, isSignedIn, user } = useUser()

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted">
        Loading...
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-8">
      {isSignedIn ? (
        <div className="text-center">
          <p className="text-ink font-semibold text-lg">Clerk working</p>
          <p className="text-muted text-sm mt-1">
            Signed in as: {user.emailAddresses[0].emailAddress}
          </p>
        </div>
      ) : (
        <SignIn />
      )}
    </div>
  )
}

export default function ClerkTestPage() {
  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
      <SEO noindex title="Clerk Test" description="Internal authentication test page." />
      <ClerkTestContent />
    </ClerkProvider>
  )
}