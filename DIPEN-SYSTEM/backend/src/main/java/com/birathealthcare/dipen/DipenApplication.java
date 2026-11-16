package com.birathealthcare.dipen;

import jakarta.annotation.PostConstruct;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.util.TimeZone;

@SpringBootApplication
@EnableScheduling
@EnableCaching
public class DipenApplication {

  @PostConstruct
  public void initTimezone() {
    TimeZone.setDefault(TimeZone.getTimeZone("Asia/Kathmandu"));
  }

  public static void main(String[] args) {
    SpringApplication.run(DipenApplication.class, args);
  }
}
