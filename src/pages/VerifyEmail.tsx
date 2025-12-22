import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { verifyEmail } from '@/lib/api';
import { Button } from '@/components/ui/button';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    
    if (!token) {
      setStatus('error');
      setMessage('No verification token provided');
      return;
    }

    const verify = async () => {
      try {
        const result = await verifyEmail(token);
        setStatus('success');
        setMessage(result.message || 'Email verified successfully!');
      } catch (error: any) {
        setStatus('error');
        setMessage(error?.message || 'Email verification failed');
      }
    };

    verify();
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="bg-card border border-border rounded-lg p-8 max-w-md w-full text-center">
        {status === 'loading' && (
          <>
            <Loader2 className="h-12 w-12 text-primary mx-auto mb-4 animate-spin" />
            <h1 className="text-xl font-semibold mb-2">Verifying Email</h1>
            <p className="text-muted-foreground">Please wait while we verify your email address...</p>
          </>
        )}
        
        {status === 'success' && (
          <>
            <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-4" />
            <h1 className="text-xl font-semibold mb-2">Email Verified!</h1>
            <p className="text-muted-foreground mb-6">{message}</p>
            <Button onClick={() => navigate('/')}>
              Go to Login
            </Button>
          </>
        )}
        
        {status === 'error' && (
          <>
            <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h1 className="text-xl font-semibold mb-2">Verification Failed</h1>
            <p className="text-muted-foreground mb-6">{message}</p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={() => navigate('/')}>
                Go Home
              </Button>
              <Button onClick={() => window.location.reload()}>
                Try Again
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

