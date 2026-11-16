package com.birathealthcare.dipen;

import jakarta.annotation.PostConstruct;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.Enumeration;
import java.util.TimeZone;

@SpringBootApplication
@EnableScheduling
@EnableAsync
@EnableCaching
public class DipenApplication {

  private final Environment env;

  public DipenApplication(Environment env) {
    this.env = env;
  }

  @PostConstruct
  public void initTimezone() {
    TimeZone.setDefault(TimeZone.getTimeZone("Asia/Kathmandu"));
  }

  @EventListener(ApplicationReadyEvent.class)
  public void printAccessUrls() {
    String port = env.getProperty("local.server.port", env.getProperty("server.port", "8080"));
    System.out.println("\n======================================================================");
    System.out.println("  DIPEN SYSTEM — MANUFACTURING ERP IS LIVE");
    System.out.println("  This PC:         http://localhost:" + port + "/");
    try {
      String hostName = InetAddress.getLocalHost().getHostName();
      System.out.println("  PC Hostname URL: http://" + hostName + ":" + port + "/");
    } catch (Exception ignored) {}

    try {
      Enumeration<NetworkInterface> nics = NetworkInterface.getNetworkInterfaces();
      while (nics != null && nics.hasMoreElements()) {
        NetworkInterface nic = nics.nextElement();
        if (!nic.isUp() || nic.isLoopback() || nic.isVirtual()) continue;
        Enumeration<InetAddress> addrs = nic.getInetAddresses();
        while (addrs.hasMoreElements()) {
          InetAddress addr = addrs.nextElement();
          if (addr.isLoopbackAddress() || addr.isLinkLocalAddress()) continue;
          if (addr instanceof Inet4Address) {
            System.out.println("  Other PCs (LAN): http://" + addr.getHostAddress() + ":" + port + "/  (" + nic.getDisplayName() + ")");
          } else if (addr instanceof Inet6Address) {
            String ip6 = addr.getHostAddress();
            int pct = ip6.indexOf('%');
            if (pct > 0) ip6 = ip6.substring(0, pct);
            System.out.println("  Global IPv6 URL: http://[" + ip6 + "]:" + port + "/");
          }
        }
      }
    } catch (Exception ignored) {}
    System.out.println("  (Note: Do not use fe80::... link-local IPv6 addresses in browsers.)");
    System.out.println("======================================================================\n");
  }

  public static void main(String[] args) {
    SpringApplication.run(DipenApplication.class, args);
  }
}
