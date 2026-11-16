package com.birathealthcare.dipen.security;

import com.birathealthcare.dipen.entity.ErpSessionEntity;
import com.birathealthcare.dipen.entity.ErpUserEntity;
import com.birathealthcare.dipen.repository.ErpSessionRepository;
import com.birathealthcare.dipen.repository.ErpUserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Component
public class TokenAuthFilter extends OncePerRequestFilter {

  private final ErpSessionRepository sessionRepository;
  private final ErpUserRepository userRepository;

  public TokenAuthFilter(ErpSessionRepository sessionRepository, ErpUserRepository userRepository) {
    this.sessionRepository = sessionRepository;
    this.userRepository = userRepository;
  }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
      throws ServletException, IOException {
    String token = extractToken(request);
    if (token != null && !token.isBlank()) {
      Optional<ErpSessionEntity> sessionOpt = sessionRepository.findByTokenAndRevokedFalse(token.trim());
      if (sessionOpt.isPresent()) {
        ErpSessionEntity session = sessionOpt.get();
        if (session.getExpiresAt().isAfter(LocalDateTime.now())) {
          Optional<ErpUserEntity> userOpt = userRepository.findById(session.getUserEmail());
          if (userOpt.isPresent() && "Active".equalsIgnoreCase(userOpt.get().getStatus())) {
            ErpUserEntity user = userOpt.get();
            List<String> perms = userRepository.findPermissionsByRole(user.getRoleName());
            ErpPrincipal principal = new ErpPrincipal(
                user.getEmail(),
                user.getDisplayName(),
                user.getRoleName(),
                user.getDepartment(),
                user.getStatus(),
                perms
            );
            var authorities = perms.stream().map(SimpleGrantedAuthority::new).toList();
            var auth = new UsernamePasswordAuthenticationToken(principal, token, authorities);
            SecurityContextHolder.getContext().setAuthentication(auth);
          }
        }
      }
    }
    filterChain.doFilter(request, response);
  }

  private String extractToken(HttpServletRequest req) {
    String header = req.getHeader("Authorization");
    if (header != null && header.startsWith("Bearer ")) {
      return header.substring(7).trim();
    }
    String xToken = req.getHeader("X-Auth-Token");
    if (xToken != null && !xToken.isBlank()) {
      return xToken.trim();
    }
    return null;
  }
}
