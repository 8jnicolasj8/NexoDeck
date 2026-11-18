package app.nexodeck.net

import android.content.Context
import android.net.wifi.WifiManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.Inet4Address
import java.net.InetAddress
import java.net.NetworkInterface

/**
 * Wake-on-LAN and LAN helpers that a WebView cannot provide. Only
 * wake() uses UDP; nothing here talks to the internet.
 */
class NexoDeckNetModule : Module() {
  private var multicastLock: WifiManager.MulticastLock? = null

  override fun definition() = ModuleDefinition {
    Name("NexoDeckNet")

    AsyncFunction("wake") { mac: String, port: Int ->
      sendMagicPacket(mac, port)
    }

    AsyncFunction("localSubnets") {
      localSubnets()
    }

    AsyncFunction("acquireMulticast") {
      val context = appContext.reactContext
      if (context == null || multicastLock != null) return@AsyncFunction null
      val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
      if (wifi == null) return@AsyncFunction null
      val lock = wifi.createMulticastLock("nexodeck-mdns")
      lock.setReferenceCounted(false)
      lock.acquire()
      multicastLock = lock
      null
    }

    AsyncFunction("releaseMulticast") {
      multicastLock?.release()
      multicastLock = null
    }

    OnDestroy {
      multicastLock?.release()
      multicastLock = null
    }
  }

  private fun sendMagicPacket(mac: String, port: Int): Boolean {
    val clean = mac.filter { it.isLetterOrDigit() }
    if (clean.length != 12) return false

    val macBytes = ByteArray(6) { index ->
      clean.substring(index * 2, index * 2 + 2).toInt(16).toByte()
    }
    val packet = ByteArray(6 + 16 * 6)
    for (index in 0 until 6) packet[index] = 0xFF.toByte()
    for (repeat in 0 until 16) {
      System.arraycopy(macBytes, 0, packet, 6 + repeat * 6, 6)
    }

    var sent = false
    val targets = mutableSetOf("255.255.255.255")
    targets.addAll(broadcastAddresses())

    try {
      DatagramSocket().use { socket ->
        socket.broadcast = true
        for (target in targets) {
          try {
            socket.send(DatagramPacket(packet, packet.size, InetAddress.getByName(target), port))
            sent = true
          } catch (_: Exception) {
            // Try the next broadcast address.
          }
        }
      }
    } catch (_: Exception) {
      return false
    }
    return sent
  }

  private fun broadcastAddresses(): List<String> {
    val result = mutableListOf<String>()
    try {
      for (network in NetworkInterface.getNetworkInterfaces()) {
        if (!network.isUp || network.isLoopback) continue
        for (interfaceAddress in network.interfaceAddresses) {
          val address = interfaceAddress.address
          if (address is Inet4Address) {
            interfaceAddress.broadcast?.let { result.add(it.hostAddress ?: "") }
          }
        }
      }
    } catch (_: Exception) {
      // Ignore interfaces that disappear while enumerating.
    }
    return result.filter { it.isNotEmpty() }
  }

  private fun localSubnets(): List<String> {
    val result = mutableSetOf<String>()
    try {
      for (network in NetworkInterface.getNetworkInterfaces()) {
        if (!network.isUp || network.isLoopback) continue
        for (interfaceAddress in network.interfaceAddresses) {
          val address = interfaceAddress.address
          if (address is Inet4Address) {
            val parts = address.hostAddress?.split(".") ?: continue
            if (parts.size == 4) result.add("${parts[0]}.${parts[1]}.${parts[2]}")
          }
        }
      }
    } catch (_: Exception) {
      // Nothing to scan.
    }
    return result.toList()
  }
}
