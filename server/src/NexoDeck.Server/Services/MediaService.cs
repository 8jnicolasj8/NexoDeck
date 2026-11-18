namespace NexoDeck.Server.Services;

internal sealed class MediaService
{
    private const ushort VK_VOLUME_MUTE = 0xAD;
    private const ushort VK_VOLUME_DOWN = 0xAE;
    private const ushort VK_VOLUME_UP = 0xAF;
    private const ushort VK_MEDIA_NEXT_TRACK = 0xB0;
    private const ushort VK_MEDIA_PREV_TRACK = 0xB1;
    private const ushort VK_MEDIA_STOP = 0xB2;
    private const ushort VK_MEDIA_PLAY_PAUSE = 0xB3;

    public void Execute(string cmd)
    {
        var normalized = cmd.Trim().ToLowerInvariant();
        ushort vk = normalized switch
        {
            "playpause" or "play" or "pause" => VK_MEDIA_PLAY_PAUSE,
            "next" => VK_MEDIA_NEXT_TRACK,
            "prev" or "previous" => VK_MEDIA_PREV_TRACK,
            "stop" => VK_MEDIA_STOP,
            "volup" or "volumeup" => VK_VOLUME_UP,
            "voldown" or "volumedown" => VK_VOLUME_DOWN,
            "mute" => VK_VOLUME_MUTE,
            _ => 0
        };

        if (vk != 0)
        {
            InputService.SendVirtualKey(vk);
        }
    }
}
