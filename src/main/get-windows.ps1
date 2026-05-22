[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;
public class WindowHelper {
    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")]
    public static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
$windows = @()
[WindowHelper]::EnumWindows({
    param($hWnd, $lParam)
    if ([WindowHelper]::IsWindowVisible($hWnd)) {
        $len = [WindowHelper]::GetWindowTextLength($hWnd)
        if ($len -gt 0) {
            $sb = New-Object System.Text.StringBuilder($len + 1)
            [WindowHelper]::GetWindowText($hWnd, $sb, $sb.Capacity) | Out-Null
            $title = $sb.ToString()
            if ($title -and $title.Length -gt 0) {
                $rect = New-Object WindowHelper+RECT
                [WindowHelper]::GetWindowRect($hWnd, [ref]$rect) | Out-Null
                if ($rect.Right - $rect.Left -gt 0 -and $rect.Bottom - $rect.Top -gt 0) {
                    $script:windows += [PSCustomObject]@{
                        hwnd = $hWnd.ToInt64()
                        title = $title
                        x = $rect.Left
                        y = $rect.Top
                        width = $rect.Right - $rect.Left
                        height = $rect.Bottom - $rect.Top
                    }
                }
            }
        }
    }
    return $true
}, [IntPtr]::Zero) | Out-Null
$windows | ConvertTo-Json -Compress -Depth 3
