export function LoadingScreen() {
    return (
        <div className="fixed inset-0 bg-background flex items-center justify-center">
            <div className="text-center">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4 mx-auto" />
                <p className="text-muted-foreground text-sm">Loading...</p>
            </div>
        </div>
    )
}