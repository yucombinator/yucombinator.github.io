$(document).ready(function() {
	//hide timeline blocks which are outside the viewport
    var $timeline_block = $('.timeline-block');
	$timeline_block.each(function(){
		if($(this).offset().top > $(window).scrollTop()+$(window).height()*0.75) {
			$(this).find('.timeline-img, .timeline-content').addClass('is-hidden');
		}
	});

	//on scrolling, show/animate timeline blocks when enter the viewport
	$(window).on('scroll', function(){
		$timeline_block.each(function(){
			if( $(this).offset().top <= $(window).scrollTop()+$(window).height()*0.75 && $(this).find('.timeline-img').hasClass('is-hidden') ) {
				$(this).find('.timeline-img, .timeline-content').removeClass('is-hidden').addClass('bounce-in');
			}
		});
	});
    $('a').click(function(){
        $('html, body').animate({
            scrollTop: $('[name="' + $.attr(this, 'href').substr(1) + '"]').offset().top
        }, 500);
        return false;
    });
    //PHOTO SLIDESHOW
    _500px.init({
      sdk_key: '7c2b5b1e3f4206225e41a2e4b44a5c6f0e305044'
    });
    _500px.api('/photos', { feature: 'user', username: "yuchenhou",image_size:5 }, function (response) {
        var value = Math.floor((Math.random() * response.data.photos.length));

        //Temp load the picture
        $('<img/>').attr('src', response.data.photos[value].image_url).load(function() {
            $(this).remove(); // prevent memory leaks as @benweet suggested
            $('.header-picture').css("background-image", "url("+response.data.photos[value].image_url +")");
            $( ".header-color" ).fadeTo( "slow" , 0.3, function() {
            // Animation complete.
            });
        });
    });
});
