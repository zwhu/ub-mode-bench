ARG TASK_IMAGE
FROM ${TASK_IMAGE}
COPY docker/vendor/wheels/ /tmp/wheels/
RUN python3 -m pip install --break-system-packages --no-index --find-links=/tmp/wheels \
    crapper==0.1.0 dryer==0.1.0 mutator==0.1.0 tree-sitter==0.25.2 tree-sitter-language-pack==1.22.1 \
    && rm -rf /tmp/wheels

COPY docker/vendor/parser-libs/ /opt/parser-libs/
ENV TREE_SITTER_LANGUAGE_PACK_LIBS_DIR=/opt/parser-libs \
    TREE_SITTER_LANGUAGE_PACK_CACHE_DIR=/opt/parser-cache
RUN mkdir -p /opt/parser-cache && chmod -R a+rX /opt/parser-libs /opt/parser-cache
