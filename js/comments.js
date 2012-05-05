(function (Site, $, Hogan) {
    'use strict';

    var $comments = $('#comments'),
        commentsTemplate = Hogan.compile($('#comments-template').html());


    $.ajax('https://api.github.com/repos/Rowno/rolandwarmerdam.co.nz/issues/' + Site.variables.commentsIssueId + '/comments', {
        type: 'GET',
        dataType: 'json',
        cache: false,
        headers: {
            accept: 'application/vnd.github.beta.html+json'
        },
        success: function (result){
            var $html = $(commentsTemplate.render({
                site: Site.variables,
                comments: result
            }));
            $html.find('time').timeago();
            $comments.append($html);
            $comments.attr('aria-hidden', false);
        }
    });
}(Site, jQuery, Hogan));