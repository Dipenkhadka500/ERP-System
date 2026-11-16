package com.birathealthcare.dipen.config;

import com.birathealthcare.dipen.security.TokenAuthFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

  private final TokenAuthFilter tokenAuthFilter;

  public SecurityConfig(TokenAuthFilter tokenAuthFilter) {
    this.tokenAuthFilter = tokenAuthFilter;
  }

  @Bean
  public PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder(10);
  }

  @Bean
  public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
    http
        .csrf(csrf -> csrf.disable())
        .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .authorizeHttpRequests(auth -> auth
            .requestMatchers(
                "/", "/index.html", "/css/**", "/js/**", "/assets/**", "/modules/**", "/favicon.ico",
                "/api/auth/login", "/api/auth/logout", "/api/auth/me",
                "/api/rpc/loginUser", "/api/rpc/logoutUser", "/api/rpc/getCurrentUserContext",
                "/api/rpc/checkDataVersion"
            ).permitAll()
            .requestMatchers("/api/**").authenticated()
            .anyRequest().permitAll()
        )
        .addFilterBefore(tokenAuthFilter, UsernamePasswordAuthenticationFilter.class);
    return http.build();
  }
}
