type AppLoadingProps = {
  message: string;
};

export function AppLoading({ message }: AppLoadingProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin-loader rounded-full border-4 border-surface-high border-t-primary" />
        <p className="text-sm font-medium text-on-surface-variant">{message}</p>
      </div>
    </div>
  );
}
