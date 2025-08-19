import type { Metadata } from 'next'
import { CopilotKit } from "@copilotkit/react-core"
import "@copilotkit/react-ui/styles.css"
import './globals.css'

export const metadata: Metadata = {
  title: 'Blender Web Sync Client',
  description: 'Real-time Blender 3D model synchronization web client',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
      </head>
      <body>
        <CopilotKit
          runtimeUrl="/api/copilotkit"
          agent="blender_workflow"
          showDevConsole={false}
        >
          {children}
        </CopilotKit>
      </body>
    </html>
  )
}