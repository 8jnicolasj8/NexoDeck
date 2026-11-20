using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

namespace VexaDeck.Server.Services;

/// <summary>
/// Windows DPAPI (current-user scope) used to store protocol v2 device keys at
/// rest. P/Invoke keeps the project free of extra packages.
/// </summary>
internal static class Dpapi
{
    private const int UIForbidden = 0x1;
    private const int CryptProtectUiForbidden = 0x1;

    [StructLayout(LayoutKind.Sequential)]
    private struct DataBlob
    {
        public int Size;
        public IntPtr Data;
    }

    [DllImport("crypt32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool CryptProtectData(
        ref DataBlob dataIn, string? description, IntPtr optionalEntropy,
        IntPtr reserved, IntPtr promptStruct, int flags, out DataBlob dataOut);

    [DllImport("crypt32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool CryptUnprotectData(
        ref DataBlob dataIn, IntPtr description, IntPtr optionalEntropy,
        IntPtr reserved, IntPtr promptStruct, int flags, out DataBlob dataOut);

    [DllImport("kernel32.dll")]
    private static extern IntPtr LocalFree(IntPtr handle);

    public static string? Protect(string plain)
    {
        var input = Encoding.UTF8.GetBytes(plain);
        var inBlob = new DataBlob { Size = input.Length, Data = Marshal.AllocHGlobal(input.Length) };
        try
        {
            Marshal.Copy(input, 0, inBlob.Data, input.Length);
            if (!CryptProtectData(ref inBlob, "VexaDeck device key", IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, UIForbidden | CryptProtectUiForbidden, out var outBlob))
            {
                return null;
            }
            try
            {
                var output = new byte[outBlob.Size];
                Marshal.Copy(outBlob.Data, output, 0, outBlob.Size);
                return V2.B64Url(output);
            }
            finally { LocalFree(outBlob.Data); }
        }
        catch (Win32Exception) { return null; }
        finally { Marshal.FreeHGlobal(inBlob.Data); }
    }

    public static string? Unprotect(string protectedValue)
    {
        byte[] input;
        try { input = V2.FromB64Url(protectedValue); }
        catch (FormatException) { return null; }

        var inBlob = new DataBlob { Size = input.Length, Data = Marshal.AllocHGlobal(input.Length) };
        try
        {
            Marshal.Copy(input, 0, inBlob.Data, input.Length);
            if (!CryptUnprotectData(ref inBlob, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, UIForbidden | CryptProtectUiForbidden, out var outBlob))
            {
                return null;
            }
            try
            {
                var output = new byte[outBlob.Size];
                Marshal.Copy(outBlob.Data, output, 0, outBlob.Size);
                return Encoding.UTF8.GetString(output);
            }
            finally { LocalFree(outBlob.Data); }
        }
        catch (Win32Exception) { return null; }
        finally { Marshal.FreeHGlobal(inBlob.Data); }
    }
}
