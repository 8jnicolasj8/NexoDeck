using System.Runtime.InteropServices;

namespace VexaDeck.Server.Services;

internal sealed class InputService
{
    private const uint INPUT_KEYBOARD = 1;
    private const uint KEYEVENTF_EXTENDEDKEY = 0x0001;
    private const uint KEYEVENTF_KEYUP = 0x0002;
    private const uint KEYEVENTF_UNICODE = 0x0004;

    [StructLayout(LayoutKind.Sequential)]
    private struct INPUT
    {
        public uint type;
        public InputUnion U;
        public static int Size => Marshal.SizeOf<INPUT>();
    }

    [StructLayout(LayoutKind.Explicit)]
    private struct InputUnion
    {
        [FieldOffset(0)] public MOUSEINPUT mi;
        [FieldOffset(0)] public KEYBDINPUT ki;
        [FieldOffset(0)] public HARDWAREINPUT hi;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public UIntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)]
    private struct HARDWAREINPUT { public uint uMsg; public ushort wParamL; public ushort wParamH; }

    [StructLayout(LayoutKind.Sequential)]
    private struct KEYBDINPUT
    {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public UIntPtr dwExtraInfo;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(uint nInputs, [MarshalAs(UnmanagedType.LPArray), In] INPUT[] pInputs, int cbSize);

    public void SendHotkey(IEnumerable<string> keys)
    {
        var vks = new List<ushort>();
        foreach (var key in keys)
        {
            var vk = ParseKey(key);
            if (vk != 0) vks.Add(vk);
        }

        if (vks.Count == 0) return;

        // 1. Press all keys in forward sequence
        var downInputs = new INPUT[vks.Count];
        for (var i = 0; i < vks.Count; i++)
        {
            var flags = IsExtendedKey(vks[i]) ? KEYEVENTF_EXTENDEDKEY : 0u;
            downInputs[i] = new INPUT
            {
                type = INPUT_KEYBOARD,
                U = new InputUnion { ki = new KEYBDINPUT { wVk = vks[i], dwFlags = flags } }
            };
        }
        SendInput((uint)downInputs.Length, downInputs, INPUT.Size);

        Thread.Sleep(20);

        // 2. Release all keys in reverse sequence
        var upInputs = new INPUT[vks.Count];
        for (var i = 0; i < vks.Count; i++)
        {
            var vk = vks[vks.Count - 1 - i];
            var flags = KEYEVENTF_KEYUP | (IsExtendedKey(vk) ? KEYEVENTF_EXTENDEDKEY : 0u);
            upInputs[i] = new INPUT
            {
                type = INPUT_KEYBOARD,
                U = new InputUnion { ki = new KEYBDINPUT { wVk = vk, dwFlags = flags } }
            };
        }
        SendInput((uint)upInputs.Length, upInputs, INPUT.Size);
    }

    public void TypeText(string text)
    {
        if (string.IsNullOrEmpty(text)) return;

        var inputs = new List<INPUT>();
        foreach (var ch in text)
        {
            // Key down
            inputs.Add(new INPUT
            {
                type = INPUT_KEYBOARD,
                U = new InputUnion
                {
                    ki = new KEYBDINPUT
                    {
                        wVk = 0,
                        wScan = ch,
                        dwFlags = KEYEVENTF_UNICODE
                    }
                }
            });
            // Key up
            inputs.Add(new INPUT
            {
                type = INPUT_KEYBOARD,
                U = new InputUnion
                {
                    ki = new KEYBDINPUT
                    {
                        wVk = 0,
                        wScan = ch,
                        dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP
                    }
                }
            });
        }

        SendInput((uint)inputs.Count, inputs.ToArray(), INPUT.Size);
    }

    public static void SendVirtualKey(ushort vk)
    {
        var flags = IsExtendedKey(vk) ? KEYEVENTF_EXTENDEDKEY : 0u;
        var inputs = new INPUT[]
        {
            new()
            {
                type = INPUT_KEYBOARD,
                U = new InputUnion { ki = new KEYBDINPUT { wVk = vk, dwFlags = flags } }
            },
            new()
            {
                type = INPUT_KEYBOARD,
                U = new InputUnion { ki = new KEYBDINPUT { wVk = vk, dwFlags = flags | KEYEVENTF_KEYUP } }
            }
        };
        SendInput(2, inputs, INPUT.Size);
    }

    private static bool IsExtendedKey(ushort vk)
    {
        return vk is 0x21 or 0x22 or 0x23 or 0x24 or 0x25 or 0x26 or 0x27 or 0x28 or 0x2D or 0x2E or 0x5B or 0x5C or 0x5D;
    }

    private static ushort ParseKey(string key)
    {
        var normalized = key.Trim().ToLowerInvariant();
        return normalized switch
        {
            "ctrl" or "control" => 0x11,
            "shift" => 0x10,
            "alt" or "menu" => 0x12,
            "win" or "windows" or "super" or "meta" => 0x5B,
            "esc" or "escape" => 0x1B,
            "enter" or "return" => 0x0D,
            "tab" => 0x09,
            "space" => 0x20,
            "backspace" => 0x08,
            "del" or "delete" => 0x2E,
            "ins" or "insert" => 0x2D,
            "home" => 0x24,
            "end" => 0x23,
            "pageup" or "pgup" => 0x21,
            "pagedown" or "pgdn" => 0x22,
            "up" => 0x26,
            "down" => 0x28,
            "left" => 0x25,
            "right" => 0x27,
            "prtscn" or "printscreen" or "print" => 0x2C,
            "pause" => 0x13,
            "caps" or "capslock" => 0x14,
            "numlock" => 0x90,
            "scrolllock" => 0x91,
            "f1" => 0x70,
            "f2" => 0x71,
            "f3" => 0x72,
            "f4" => 0x73,
            "f5" => 0x74,
            "f6" => 0x75,
            "f7" => 0x76,
            "f8" => 0x77,
            "f9" => 0x78,
            "f10" => 0x79,
            "f11" => 0x7A,
            "f12" => 0x7B,
            "add" or "plus" or "+" => 0x6B,
            "subtract" or "minus" or "-" => 0x6D,
            "multiply" or "*" => 0x6A,
            "divide" or "numpaddivide" => 0x6F,
            "slash" or "oem2" or "/" => 0xBF,
            "backslash" or "oem5" => 0xDC,
            "backtick" or "grave" or "`" => 0xC0,
            "semicolon" or "oem1" => 0xBA,
            "quote" or "'" => 0xDE,
            "comma" or "," => 0xBC,
            "period" or "." => 0xBE,
            "oemplus" => 0xBB,
            "oemminus" => 0xBD,
            "bracketleft" or "[" => 0xDB,
            "bracketright" or "]" => 0xDD,
            _ when normalized.Length == 1 && normalized[0] is >= 'a' and <= 'z' => (ushort)(0x41 + (normalized[0] - 'a')),
            _ when normalized.Length == 1 && normalized[0] is >= '0' and <= '9' => (ushort)(0x30 + (normalized[0] - '0')),
            _ => 0
        };
    }
}
